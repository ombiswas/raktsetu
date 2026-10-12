import { createConfig } from './platform/config/index.js';
import { createLogger } from './platform/logging/index.js';
import { buildApp } from './app.js';

async function bootstrap(): Promise<void> {
  let cfg;
  try {
    cfg = createConfig(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const appLogger = createLogger(cfg);

  try {
    const app = await buildApp({ config: cfg, logger: appLogger });

    const shutdown = async (signal: string) => {
      appLogger.info({ signal }, 'Received termination signal, shutting down gracefully...');
      try {
        await app.close();
        appLogger.info('Server closed successfully');
        process.exit(0);
      } catch (closeErr) {
        appLogger.error({ err: closeErr }, 'Error during server shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    const address = await app.listen({ port: cfg.PORT, host: cfg.HOST });
    appLogger.info(
      {
        address,
        port: cfg.PORT,
        host: cfg.HOST,
        env: cfg.NODE_ENV,
        docs: cfg.isProduction ? 'disabled' : `http://${cfg.HOST}:${cfg.PORT}/docs`
      },
      'RaktSetu API server listening'
    );
  } catch (startupErr) {
    appLogger.fatal({ err: startupErr }, 'Fatal error during API bootstrap');
    process.exit(1);
  }
}

void bootstrap();
