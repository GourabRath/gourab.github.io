require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { getJwtSecret, verifyToken } = require('./security');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const prisma = new PrismaClient();

function allowedOrigins() {
  const configured = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set(configured);
}

function createRateLimiter({ limit = 120, windowMs = 60_000 } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let record = clients.get(key);
    if (!record || record.expiresAt <= now) {
      record = { count: 0, expiresAt: now + windowMs };
      clients.set(key, record);
    }
    record.count += 1;
    if (clients.size > 10_000) {
      for (const [ip, state] of clients) if (state.expiresAt <= now) clients.delete(ip);
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - record.count)));
    if (record.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((record.expiresAt - now) / 1000)));
      return res.status(429).json({ errors: [{ message: 'Too many requests. Try again later.' }] });
    }
    return next();
  };
}

function assertConfiguration() {
  if (!process.env.DATABASE_URL || !/^mongodb(?:\+srv)?:\/\//i.test(process.env.DATABASE_URL)) {
    throw new Error('DATABASE_URL must be configured with a MongoDB connection URL.');
  }
  getJwtSecret();
}

async function authenticateRequest(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) return null;
  try {
    const claims = verifyToken(match[1]);
    const current = await prisma.user.findUnique({
      where: { id: claims.id },
      select: { id: true, role: true, email: true },
    });
    if (!current || current.role !== claims.role) return null;
    return { id: current.id, role: current.role };
  } catch (_) {
    return null;
  }
}

async function startServer() {
  assertConfiguration();
  const origins = allowedOrigins();
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: Array.from(origins), methods: ['GET', 'POST'] },
  });
  io.use(async (socket, next) => {
    try {
      const claims = verifyToken(socket.handshake.auth && socket.handshake.auth.token);
      const current = await prisma.user.findUnique({
        where: { id: claims.id },
        select: { id: true, role: true },
      });
      if (!current || current.role !== claims.role) return next(new Error('Unauthorized'));
      socket.data.user = { id: current.id, role: current.role };
      return next();
    } catch (_) {
      return next(new Error('Unauthorized'));
    }
  });

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed.'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
  }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/graphql', createRateLimiter());

  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
    formatError(formatted) {
      const code = formatted.extensions && formatted.extensions.code;
      const safeCodes = new Set([
        'BAD_USER_INPUT',
        'UNAUTHENTICATED',
        'FORBIDDEN',
        'SERVICE_UNAVAILABLE',
        'GRAPHQL_VALIDATION_FAILED',
        'GRAPHQL_PARSE_FAILED',
      ]);
      return {
        message: safeCodes.has(code) ? formatted.message : 'Request failed.',
        extensions: { code: safeCodes.has(code) ? code : 'INTERNAL_SERVER_ERROR' },
      };
    },
  });
  await apollo.start();
  app.use('/graphql', expressMiddleware(apollo, {
    context: async ({ req }) => ({
      user: await authenticateRequest(req),
      prisma,
      io,
    }),
  }));

  const port = Number(process.env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, resolve);
  });
  console.info(`GraphQL server listening on port ${port}.`);
  return { app, httpServer, apollo, io };
}

if (require.main === module) {
  startServer().catch(async () => {
    console.error('Server startup failed. Check DATABASE_URL, JWT_SECRET, and MongoDB connectivity.');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}

module.exports = { startServer, authenticateRequest, createRateLimiter, assertConfiguration, prisma };
