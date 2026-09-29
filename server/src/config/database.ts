import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/devchamber';

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    console.log(`[Database] Successfully connected to MongoDB at ${MONGODB_URI}`);
    return conn;
  } catch (err: any) {
    console.error(`[Database Error] Failed to connect to MongoDB at ${MONGODB_URI}:`, err?.message || err);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] Disconnected from MongoDB.');
  }
}

export async function checkDbConnection(): Promise<{ ok: boolean; message: string; database?: string }> {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDatabase();
    }
    // Ping the database
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      return {
        ok: true,
        message: 'MongoDB connection successful',
        database: mongoose.connection.db.databaseName,
      };
    }
    return { ok: false, message: 'MongoDB not initialized' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'MongoDB connection check failed' };
  }
}

export { mongoose, MONGODB_URI };
