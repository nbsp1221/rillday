import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { HttpFault } from '../../../http-errors.ts';

const exposedRoutes = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
  '/api/auth/change-password',
  '/api/auth/update-user',
  '/api/auth/revoke-session',
  '/api/auth/revoke-sessions',
  '/api/auth/revoke-other-sessions',
  '/api/auth/list-sessions',
]);

interface AuthenticationAdapter {
  origin: string;
  checkOrigin(origin: string | undefined): void;
  passwordJob<T>(action: () => Promise<T>): Promise<T>;
}

export function registerAuthenticationAdapter(
  app: FastifyInstance,
  auth: { handler(request: Request): Promise<Response> },
  options: AuthenticationAdapter,
) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    bodyLimit: 16384,
    config: { rateLimit: { max: 60, timeWindow: 60000 } },
    handler: async (request, reply) => {
      options.checkOrigin(request.headers.origin);
      const pathname = new URL(request.url, options.origin).pathname;
      if (!exposedRoutes.has(pathname)) {
        return reply.code(404).send({ error: 'not_found' });
      }
      if (
        pathname === '/api/auth/update-user' &&
        (!request.body ||
          typeof request.body !== 'object' ||
          Object.keys(request.body).some((key) => !['name', 'image'].includes(key)))
      ) {
        throw new HttpFault('invalid_request');
      }

      const run = () =>
        auth.handler(
          new Request(options.origin + request.url, {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(request.method === 'GET' ? {} : { body: JSON.stringify(request.body ?? {}) }),
          }),
        );

      const response =
        pathname === '/api/auth/sign-in/email' ? await options.passwordJob(run) : await run();

      reply.code(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'set-cookie') {
          reply.header(name, value);
        }
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) {
        reply.header('set-cookie', cookies);
      }

      return reply.send(await response.text());
    },
  });
}
