import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Dynamic proxy connection that safely resolves to the active MongoDB database connection
export const dbConnections = {
  get db1() {
    return mongoose.connection.db || mongoose.connection;
  },
  get db2() {
    return mongoose.connection.db || mongoose.connection;
  },
  model(...args) {
    return mongoose.model(...args);
  },
  models: mongoose.models,
};

function cleanUri(raw) {
  if (!raw) return '';
  // In case someone pasted 'MONGO_URI_1 = mongodb://...'
  const match = raw.match(/mongodb(?:\+srv)?:\/\/[^\s]+/);
  return match ? match[0] : raw.trim();
}

export async function connectDB(mongoUri) {
  const rawUri = mongoUri 
    || process.env.MONGO_URI_2 
    || process.env.MONGODB_URI 
    || process.env.MONGO_URI_1 
    || process.env.MONGO_URI 
    || 'mongodb://localhost:27017/credence';

  const uri = cleanUri(rawUri);

  try {
    const conn = await mongoose.connect(uri);
    // console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    return null;
  }
}
