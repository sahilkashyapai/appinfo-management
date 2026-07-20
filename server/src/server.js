require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { startCronJobs } = require('./services/cronJobs');
const { seedMinimal } = require('./seed/runSeed');
const { initSocket } = require('./realtime/io');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  if (connectDB.isUsingMemoryServer()) {
    console.log('[server] in-memory DB — seeding just the login account (run `npm run seed` for full demo data).');
    await seedMinimal();
  }

  startCronJobs();

  const httpServer = http.createServer(app);
  initSocket(httpServer, app.corsOrigin);
  httpServer.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
