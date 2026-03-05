const mongoose = require('mongoose');

const connectDB = async (uri) => {
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  try {
    console.log('[db] Connecting to MongoDB...');
    // Show a masked version of the URI for debugging (don't reveal credentials)
    try {
      const masked = mongoUri.replace(/:(.*)@/, ':*****@');
      console.log('[db] Mongo URI:', masked);
    } catch {}

    await mongoose.connect(mongoUri, {
      // recommended options are handled by mongoose defaults in v6+
    });
    console.log('[db] Mongoose connected');
  } catch (err) {
    console.error('[db] Mongoose connection error:', err && err.message ? err.message : err);
    throw err;
  }
};

module.exports = connectDB;
