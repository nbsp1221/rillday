import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { AccountService } from '../application/accounts.ts';
import type { AccountAccess, AccountInput } from '../application/ports.ts';
import { maximumPasswordLength, minimumPasswordLength } from '../domain/policies.ts';

const accountBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'name', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    password: {
      type: 'string',
      minLength: minimumPasswordLength,
      maxLength: maximumPasswordLength,
    },
  },
} as const;

interface AccountRoutes {
  service: AccountService;
  serverId: string;
  checkOrigin(origin: string | undefined): void;
  access(headers: IncomingHttpHeaders): AccountAccess;
}

export function registerAccountRoutes(app: FastifyInstance, context: AccountRoutes) {
  const { service } = context;

  app.get('/v1/server', () => ({
    product: 'Rillday',
    protocol: 1,
    serverId: context.serverId,
    ...service.configuration(),
  }));

  app.post<{ Body: AccountInput }>(
    '/v1/setup',
    {
      bodyLimit: 16384,
      config: { rateLimit: { max: 10, timeWindow: 60000 } },
      schema: { body: accountBody },
    },
    async (request, reply) => {
      context.checkOrigin(request.headers.origin);
      return reply.code(201).send(await service.setup(request.body));
    },
  );

  app.get('/v1/account', async (request) => {
    context.checkOrigin(request.headers.origin);
    return service.current(context.access(request.headers));
  });

  app.get('/v1/admin/users', async (request) => {
    context.checkOrigin(request.headers.origin);
    return service.list(context.access(request.headers));
  });

  app.post<{ Body: AccountInput }>(
    '/v1/admin/users',
    { bodyLimit: 16384, schema: { body: accountBody } },
    async (request, reply) => {
      context.checkOrigin(request.headers.origin);
      return reply
        .code(201)
        .send(await service.create(context.access(request.headers), request.body));
    },
  );

  app.post<{ Params: { id: string }; Body: { disabled: boolean } }>(
    '/v1/admin/users/:id/status',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['disabled'],
          properties: { disabled: { type: 'boolean' } },
        },
      },
    },
    async (request) => {
      context.checkOrigin(request.headers.origin);
      return service.setDisabled(
        context.access(request.headers),
        request.params.id,
        request.body.disabled,
      );
    },
  );
}
