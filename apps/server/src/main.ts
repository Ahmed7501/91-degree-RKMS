import { createServer } from 'node:http';
import { createApp } from './app';
import { EnvError, loadEnv } from './config/env';
import { createPrisma } from './db/prisma';
import { DEFAULT_RATE_LIMITS, scaleRateLimits } from './http/middleware/rate-limit';
import { systemClock } from './lib/clock';
import { createLogger } from './lib/logger';
import {
  runSessionCleanup,
  SESSION_CLEANUP_INTERVAL_MS,
} from './modules/maintenance/session-cleanup';
import {
  ORDER_RETENTION_INTERVAL_MS,
  runOrderRetention,
} from './modules/maintenance/order-retention';
import { createRealtime } from './realtime/socket-server';
import { createServices } from './services';

const SHUTDOWN_GRACE_MS = 10_000;

// Local development reads the repo-root .env; containers get real variables.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    // No .env: use the environment as-is.
  }
}

function start(): void {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      // Variable names only, never values (ENVIRONMENT_VARIABLES.md).
      createLogger().fatal({ problems: error.problems }, 'invalid environment, refusing to start');
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({ level: env.logLevel });
  const prisma = createPrisma(env.databaseUrl);
  const core = {
    env,
    logger,
    clock: systemClock,
    prisma,
    rateLimits: scaleRateLimits(DEFAULT_RATE_LIMITS, env.rateLimitMultiplier),
  };
  const services = createServices(core);
  const app = createApp({ ...core, services });

  // Maintenance: at startup, then every 24 h (DATABASE §7). Failures are logged, never fatal.
  const cleanup = () =>
    runSessionCleanup(prisma, systemClock, services.sessions.ttls, logger).catch((error: unknown) =>
      logger.error(
        { errorName: error instanceof Error ? error.name : typeof error },
        'session cleanup failed',
      ),
    );
  void cleanup();
  const cleanupTimer = setInterval(() => void cleanup(), SESSION_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  // Order retention (ADR-024): at startup, then hourly.
  const retention = () =>
    runOrderRetention(services.ordersRepo, systemClock, env, logger).catch((error: unknown) =>
      logger.error(
        { errorName: error instanceof Error ? error.name : typeof error },
        'order retention failed',
      ),
    );
  void retention();
  const retentionTimer = setInterval(() => void retention(), ORDER_RETENTION_INTERVAL_MS);
  retentionTimer.unref();

  const server = createServer(app);
  // Slow-client protection while receiving a request (ERROR_HANDLING §3).
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 65_000;
  const realtime = createRealtime(server, { env, logger, clock: systemClock, services });

  server.listen(env.port, () => {
    logger.info({ port: env.port, nodeEnv: env.nodeEnv }, 'server listening');
  });

  let shuttingDown = false;
  const shutdown = (reason: string, exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');
    clearInterval(cleanupTimer);
    clearInterval(retentionTimer);
    const force = setTimeout(() => process.exit(exitCode || 1), SHUTDOWN_GRACE_MS);
    force.unref();
    // Closing Socket.IO disconnects every socket and closes the HTTP server.
    server.closeIdleConnections();
    realtime
      .close()
      .then(() => prisma.$disconnect())
      .catch(() => undefined)
      .finally(() => process.exit(exitCode));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('unhandledRejection', (reason) => {
    logger.fatal(
      {
        errorName: reason instanceof Error ? reason.name : typeof reason,
        stack: reason instanceof Error ? reason.stack : undefined,
      },
      'unhandled rejection',
    );
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ errorName: error.name, stack: error.stack }, 'uncaught exception');
    shutdown('uncaughtException', 1);
  });
}

start();
