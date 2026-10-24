import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import swagger from '@fastify/swagger';
import { HttpFault } from './http-errors.ts';
import { AccountError, type AccountErrorCode } from './modules/accounts/index.ts';

export const maximumRequestBodyBytes = 64 * 1024 * 1024;

const accountErrorStatus = {
  setup_complete: 409,
  unauthenticated: 401,
  administrator_required: 403,
  account_capacity: 409,
  not_found: 404,
  administrator_protected: 409,
} satisfies Record<AccountErrorCode, number>;

export async function registerHttpPolicy(app: FastifyInstance, origins: string[]) {
  await app.register(cors, {
    origin: (origin, done) => done(null, !origin || origins.includes(origin)),
    credentials: true,
    exposedHeaders: ['set-auth-token'],
    allowedHeaders: ['content-type', 'authorization'],
  });
  await app.register(rateLimit, { max: 5000, timeWindow: 60000 });
  await app.register(swagger, {
    openapi: { info: { title: 'Rillday server', version: '1.0.0' } },
  });

  app.setErrorHandler<Error & { validation?: unknown; statusCode?: number }>((e, req, reply) => {
    if (e instanceof AccountError) {
      return reply.code(accountErrorStatus[e.code]).send({ error: e.code });
    }
    if (e instanceof HttpFault) {
      if (e.status >= 500) {
        req.log.error({ err: e, code: e.code }, 'Request failed');
      }
      return reply.code(e.status).send({ error: e.code });
    }
    if (e.validation) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: 'request_rejected' });
    }
    req.log.error({ err: e }, 'Request failed');
    return reply.code(500).send({ error: 'internal_error' });
  });
}

export async function registerWebApplication(app: FastifyInstance, webDir: string) {
  if (existsSync(webDir)) {
    await app.register(staticFiles, {
      root: webDir,
      setHeaders(reply, filePath) {
        if (
          /^assets\/[^/]+-[\w-]{8}\.woff2$/.test(relative(webDir, filePath).replaceAll('\\', '/'))
        ) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.url.startsWith('/v1/') ||
        req.url.startsWith('/api/') ||
        !req.headers.accept?.includes('text/html')
      ) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  }
}
