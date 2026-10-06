const { PrismaClient } = require('@prisma/client');

// One PrismaClient (and so one MySQL connection pool) per process.
const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

module.exports = prisma;
