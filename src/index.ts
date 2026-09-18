import pino from 'pino';
import { loadConfig } from './config.js';
import { BegetAuthMcpServer } from './server.js';

async function main() {
  const config = loadConfig();

  const logger = pino({
    level: config.logLevel,
    transport: config.nodeEnv !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    } : undefined,
    redact: {
      paths: ['password', 'code', 'token', '*.password', '*.code', '*.token', 'req.headers.authorization'],
      remove: true,
    },
  });

  logger.info({ 
    port: config.port,
    begetApiBase: config.begetApiBase,
    nodeEnv: config.nodeEnv,
    autoLogin: !!config.begetLogin,
    ipAllowlist: !!config.allowedCidrs,
  }, 'Starting Beget Auth MCP Server');

  const server = new BegetAuthMcpServer(config, logger);

  await server.start();

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
