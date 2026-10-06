require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { startCronJobs } = require('./services/cronJobs');
const { initSocket } = require('./realtime/io');

const PORT = process.env.PORT || 5000;

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
