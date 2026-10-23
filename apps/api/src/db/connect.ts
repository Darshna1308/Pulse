import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

// Unknown filter paths are dropped. Operator injection ({ $gt: '' }) is prevented upstream:
// every request input is parsed by a Zod schema into primitive types before querying.
mongoose.set('strictQuery', true);

export async function connectDb(uri: string): Promise<typeof mongoose> {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: true });
  logger.info({ db: conn.connection.name }, 'Connected to MongoDB');
  return conn;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
