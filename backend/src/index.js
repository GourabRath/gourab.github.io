require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { createServer } = require('http');
const { Server } = require('socket.io');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  
  // Socket.io for Real-time
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
  });

  // Middlewares
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors());
  app.use(express.json());

  // Apollo GraphQL
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });
  
  await server.start();
  
  app.use('/graphql', expressMiddleware(server, {
    context: async ({ req }) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      let user = null;
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
          console.error("Invalid token");
        }
      }
      return { user, prisma, io };
    },
  }));

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
  });
}

startServer().catch(console.error);

