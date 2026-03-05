const { MongoClient } = require('mongodb');

let client;
let database;

async function connectToMongo(uri) {
  if (!uri) throw new Error('MONGODB_URI is required');
  client = new MongoClient(uri);
  await client.connect();
  // use default database from URI or fallback to 'doubtsense'
  database = client.db();
  console.log('[db] Connected to MongoDB');
  return database;
}

function getDb() {
  if (!database) throw new Error('Database not initialized. Call connectToMongo first.');
  return database;
}

function getClient() {
  return client;
}

module.exports = { connectToMongo, getDb, getClient };
