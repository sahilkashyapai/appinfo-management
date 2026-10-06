require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { startCronJobs } = require('./services/cronJobs');
const { initSocket } = require('./realtime/io');

const PORT = process.env.PORT || 5000;

// Last line of defence for async work outside a request (cron jobs, socket
// handlers, fire-and-forget emails): log it instead of letting Node exit on an
// unhandled rejection. Request errors never get here — see middleware/asyncErrors.js.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
});

async function start() {
  await connectDB();

  startCronJobs();

  const httpServer = http.createServer(app);
  initSocket(httpServer, app.corsOrigin);
  httpServer.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
