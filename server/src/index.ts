import { createServer } from 'node:http';
import { createApp } from './app.js';
import { closeDatabase } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';

const server = createServer(createApp());
let shuttingDown = false;

server.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'Gav API is listening');
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  const forcedExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forcedExit.unref();

  server.close(async error => {
    if (error) logger.error({ err: error }, 'HTTP server close failed');
    try {
      await closeDatabase();
      clearTimeout(forcedExit);
      process.exit(error ? 1 : 0);
    } catch (databaseError) {
      logger.error({ err: databaseError }, 'Database pool close failed');
      process.exit(1);
    }
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', error => {
  logger.error({ err: error }, 'Unhandled promise rejection');
});

process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});
