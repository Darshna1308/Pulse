import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { logger } from './lib/logger.js';

async function main() {
  const config = env();
  await connectDb(config.MONGODB_URI);
  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, ml: config.ML_SERVICE_URL }, 'Pulse API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, 'Failed to start');
  process.exit(1);
});
