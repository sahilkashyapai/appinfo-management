const mongoose = require('mongoose');

let memoryServer = null;

// Uses MONGODB_URI when set (e.g. a real MongoDB Atlas cluster). If it's not
// set, falls back to a throwaway in-memory MongoDB (mongodb-memory-server) so
// the app can still boot for local development/demos with zero setup. Data in
// that fallback mode lives only as long as this process keeps running.
async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    console.log('[db] MONGODB_URI not set — starting a temporary in-memory MongoDB for local development...');
    memoryServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    uri = memoryServer.getUri();
    console.log('[db] in-memory MongoDB ready. This data resets whenever the server restarts.');
    console.log('[db] set MONGODB_URI in server/.env to use a real (persistent) database instead.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
}

function isUsingMemoryServer() {
  return !!memoryServer;
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = connectDB;
module.exports.isUsingMemoryServer = isUsingMemoryServer;
module.exports.disconnectDB = disconnectDB;
