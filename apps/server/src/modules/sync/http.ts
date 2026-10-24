import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SyncService } from './service.ts';

export function registerSyncRoutes(
  app: FastifyInstance,
  service: SyncService,
  owner: (request: FastifyRequest) => Promise<string>,
) {
  const response = {
    type: 'object',
    properties: { documentId: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
    required: ['documentId'],
  } as const;
  app.get('/v1/connection', { schema: { response: { 200: response } } }, async (request) =>
    service.document(await owner(request)),
  );
  app.post<{ Body: { documentId: string } }>(
    '/v1/connection',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['documentId'],
          properties: { documentId: { type: 'string', minLength: 1, maxLength: 100 } },
        },
        response: { 200: response },
      },
    },
    async (request) => service.register(await owner(request), request.body.documentId),
  );
  app.server.on('upgrade', service.upgrade);
  app.addHook('onClose', (_instance, done) => {
    app.server.off('upgrade', service.upgrade);
    done();
  });
}
