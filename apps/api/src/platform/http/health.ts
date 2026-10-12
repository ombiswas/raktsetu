import type { FastifyPluginAsync } from 'fastify';

export interface HealthPluginOptions {
  checkDatabase?: (() => Promise<boolean>) | undefined;
}

export const healthRoutes: FastifyPluginAsync<HealthPluginOptions> = async (
  fastify,
  opts
) => {
  const checkDatabase = opts.checkDatabase ?? (async () => true);

  // Liveness Probe
  fastify.get('/live', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Readiness Probe (checks DB connectivity)
  fastify.get('/ready', async (request, reply) => {
    try {
      const isDbReady = await checkDatabase();
      if (!isDbReady) {
        request.log.warn('Readiness probe failed: database reported not ready');
        return reply.status(503).send({
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString()
        });
      }

      return reply.status(200).send({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, 'Readiness probe error');
      return reply.status(503).send({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  });
};
