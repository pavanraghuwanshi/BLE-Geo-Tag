import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Initialize with mongoose instance so models can define schemas immediately on import
export const dbConnections = {
  db1: mongoose,
  db2: mongoose,
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
    console.log(`🍃 MongoDB (db2) Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    return null;
  }
}
