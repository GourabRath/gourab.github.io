const jwt = require('jsonwebtoken');

const JWT_ISSUER = 'medicare-api';
const JWT_AUDIENCE = 'medicare-app';
const TOKEN_LIFETIME = '8h';
const ROLES = ['PATIENT', 'DOCTOR', 'ADMIN'];

function publicError(message, code = 'BAD_USER_INPUT') {
  const error = new Error(message);
  error.extensions = { code };
  return error;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

function createToken(user) {
  return jwt.sign(
    { role: user.role },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      subject: user.id,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: TOKEN_LIFETIME,
    },
  );
}

function verifyToken(token) {
  const claims = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (!claims || typeof claims.sub !== 'string' || !ROLES.includes(claims.role)) {
    throw new Error('Invalid token');
  }
  return { id: claims.sub, role: claims.role };
}

function requireUser(user) {
  if (!user || !user.id || !ROLES.includes(user.role)) {
    throw publicError('Authentication required.', 'UNAUTHENTICATED');
  }
  return user;
}

function requireRole(user, ...roles) {
  const authenticated = requireUser(user);
  if (!roles.includes(authenticated.role)) {
    throw publicError('Not authorized.', 'FORBIDDEN');
  }
  return authenticated;
}

function validateText(value, label, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') throw publicError(`Invalid ${label}.`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) throw publicError(`Invalid ${label}.`);
  return cleaned;
}

function normalizeEmail(value) {
  const email = validateText(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError('Invalid email.');
  return email;
}

function normalizePhone(value) {
  const phone = validateText(value, 'phone number', { min: 7, max: 24 });
  if (!/^[+()\d .-]+$/.test(phone)) throw publicError('Invalid phone number.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw publicError('Invalid phone number.');
  return `+${digits}`;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    throw publicError('Password must be between 10 and 128 characters.');
  }
  return value;
}

function validateObjectId(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw publicError(`Invalid ${label}.`);
  }
  return value;
}

function validateDate(value, { future = false } = {}) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    throw publicError('Invalid date.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw publicError('Invalid date.');
  }
  if (future && date.getTime() <= Date.now()) throw publicError('Appointment date must be in the future.');
  return date;
}

function validateTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw publicError('Invalid appointment time.');
  }
  return value;
}

function audit(action, actorId, resourceId) {
  // IDs and action only: never write credentials, tokens, or clinical content.
  console.info(JSON.stringify({ type: 'audit', action, actorId, resourceId, at: new Date().toISOString() }));
}

module.exports = {
  ROLES,
  publicError,
  createToken,
  verifyToken,
  getJwtSecret,
  requireUser,
  requireRole,
  validateText,
  normalizeEmail,
  normalizePhone,
  validatePassword,
  validateObjectId,
  validateDate,
  validateTime,
  audit,
};
