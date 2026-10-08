const test = require('node:test');
const assert = require('node:assert/strict');
const TEST_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const { createToken } = require('../src/security');
const { assertConfiguration, authenticateRequest, createRateLimiter, startServer } = require('../src/index');

const USER_ID = '507f1f77bcf86cd799439011';

test('startup configuration rejects missing/weak JWT secrets and accepts MongoDB configuration', () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  try {
    process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/medicare';
    process.env.JWT_SECRET = 'short';
    assert.throws(() => assertConfiguration(), /JWT_SECRET/);
    process.env.JWT_SECRET = TEST_SECRET;
    assert.doesNotThrow(() => assertConfiguration());
    process.env.DATABASE_URL = 'postgres://not-mongodb';
    assert.throws(() => assertConfiguration(), /MongoDB/);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('request authentication rejects missing, invalid, deleted, and role-stale tokens', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  const database = { user: { findUnique: async () => ({ id: USER_ID, role: 'PATIENT' }) } };
  try {
    assert.equal(await authenticateRequest({ headers: {} }, database), null);
    assert.equal(await authenticateRequest({ headers: { authorization: 'Bearer not-a-token' } }, database), null);
    const token = createToken({ id: USER_ID, role: 'PATIENT' });
    assert.deepEqual(
      await authenticateRequest({ headers: { authorization: `Bearer ${token}` } }, database),
      { id: USER_ID, role: 'PATIENT' },
    );
    database.user.findUnique = async () => null;
    assert.equal(await authenticateRequest({ headers: { authorization: `Bearer ${token}` } }, database), null);
    database.user.findUnique = async () => ({ id: USER_ID, role: 'DOCTOR' });
    assert.equal(await authenticateRequest({ headers: { authorization: `Bearer ${token}` } }, database), null);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('in-memory limiter blocks requests above its per-IP limit', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  const response = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  let continued = false;
  limiter({ ip: 'test-client' }, response(), () => { continued = true; });
  const blocked = response();
  limiter({ ip: 'test-client' }, blocked, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After']);
});

test('Express/Apollo boots with validated configuration and serves a GraphQL request', async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/medicare';
  process.env.JWT_SECRET = TEST_SECRET;
  let running;
  try {
    running = await startServer({ port: 0 });
    const port = running.httpServer.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apollo-Require-Preflight': 'true',
      },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
    assert.deepEqual(JSON.parse(body), { data: { __typename: 'Query' } });
    const protectedResponse = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apollo-Require-Preflight': 'true',
      },
      body: JSON.stringify({ query: '{ me { id } }' }),
    });
    const protectedBody = await protectedResponse.json();
    assert.equal(protectedBody.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(protectedBody.errors[0].message, 'Authentication required.');
    const adminSchemaResponse = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apollo-Require-Preflight': 'true',
      },
      body: JSON.stringify({
        query: '{ adminOverview { patientCount doctorCount appointmentCount pendingAppointmentCount } }',
      }),
    });
    const adminSchemaBody = await adminSchemaResponse.json();
    assert.equal(adminSchemaBody.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(adminSchemaBody.errors[0].message, 'Authentication required.');
    assert.doesNotMatch(adminSchemaBody.errors[0].message, /Cannot query field/);
  } finally {
    if (running) {
      await running.apollo.stop();
      await new Promise(resolve => running.io.close(resolve));
    }
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
