import { resolve } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyRequest, type FastifyServerOptions } from 'fastify';
import invariant from 'tiny-invariant';
import { HttpFault } from './http-errors.ts';
import {
  maximumRequestBodyBytes,
  registerHttpPolicy,
  registerWebApplication,
} from './http-policy.ts';
import { instanceConfiguration } from './infrastructure/instance-configuration.ts';
import {
  createAccountModule,
  registerAccountRoutes,
  registerAuthenticationAdapter,
} from './modules/accounts/index.ts';
import { registerSyncRoutes } from './modules/sync/http.ts';
import { SyncService } from './modules/sync/index.ts';
import { ServerLifecycle } from './server-lifecycle.ts';
import { Store } from './storage.ts';

export async function createServer(
  options: {
    file?: string;
    port?: number;
    secret?: string;
    diagnostics?: boolean;
    publicUrl?: string;
    host?: string;
    clientOrigins?: string[];
    webDir?: string;
    logger?: FastifyServerOptions['logger'];
  } = {},
) {
  const port = options.port ?? 4287;
  const parsedPublicUrl = new URL(options.publicUrl ?? `http://127.0.0.1:${port}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('RILLDAY_PORT must be between 1 and 65535');
  }
  if (
    !['http:', 'https:'].includes(parsedPublicUrl.protocol) ||
    parsedPublicUrl.pathname !== '/' ||
    parsedPublicUrl.search ||
    parsedPublicUrl.hash ||
    parsedPublicUrl.username ||
    parsedPublicUrl.password
  ) {
    throw new Error('RILLDAY_PUBLIC_URL must be an HTTP(S) origin without a path');
  }
  const origin = parsedPublicUrl.origin;
  const origins = [
    origin,
    'http://tauri.localhost',
    'tauri://localhost',
    ...(options.clientOrigins ?? []).map((s) => new URL(s.trim()).origin),
  ];
  const file =
    options.file ?? resolve(import.meta.dirname, '../../../../data/rillday-server/data.sqlite');
  const store = new Store(file);
  const lifecycle = new ServerLifecycle(store);
  try {
    const instance = instanceConfiguration(store);
    invariant(instance !== undefined, 'Missing instance');
    const { service: accounts, authentication: auth } = await createAccountModule(store, {
      origin,
      origins,
      secret: options.secret ?? instance.secret,
    });
    store.initialize();
    const app = Fastify({
      logger:
        options.logger === false
          ? false
          : {
              ...(typeof options.logger === 'object' ? options.logger : {}),
              serializers: {
                req: (request: FastifyRequest) => ({
                  method: request.method,
                  route: request.routeOptions.url,
                }),
                err: (error: Error) => {
                  const heading = `${error.name}: ${error.message}`;
                  return {
                    type: error.name,
                    message: 'Request failed',
                    stack: error.stack?.startsWith(heading)
                      ? error.stack.slice(heading.length).trim()
                      : '',
                  };
                },
              },
            },
      bodyLimit: maximumRequestBodyBytes,
      // Aborted WebSocket handshakes can leave a TCP connection without an HTTP request.
      forceCloseConnections: true,
      requestTimeout: 10000,
      connectionTimeout: 10000,
      ajv: { customOptions: { removeAdditional: false } },
    });
    lifecycle.app = app;
    await registerHttpPolicy(app, origins);

    const service = new SyncService(store, auth, instance.serverId, origins, (error) =>
      app.log.error({ err: error }, 'Synchronization failed'),
    );
    lifecycle.sync = service;
    const loop = options.diagnostics ? monitorEventLoopDelay() : undefined;
    loop?.enable();
    lifecycle.loop = loop;

    const checkOrigin = (requestOrigin: string | undefined) => {
      if (requestOrigin && !origins.includes(requestOrigin)) {
        throw new HttpFault('origin_rejected', 403);
      }
    };

    async function owner(request: FastifyRequest) {
      checkOrigin(request.headers.origin);
      const session = await auth.session(request.headers);
      if (!session || !auth.isSessionActive(session.id, session.user.id)) {
        throw new HttpFault('unauthenticated', 401);
      }
      return session.user.id;
    }

    registerAccountRoutes(app, {
      service: accounts,
      serverId: instance.serverId,
      checkOrigin,
      access: auth.access,
    });
    registerAuthenticationAdapter(app, auth, {
      origin,
      checkOrigin,
      passwordJob: auth.passwordJob,
    });
    registerSyncRoutes(app, service, owner);
    app.get('/health', () => ({ ok: true, protocol: 1 }));
    app.get('/v1/openapi', () => app.swagger());
    await registerWebApplication(
      app,
      options.webDir ?? resolve(import.meta.dirname, '../../web/dist'),
    );
    if (loop) {
      app.get('/v1/diagnostics', async (request) => {
        await owner(request);
        return {
          memory: process.memoryUsage(),
          resources: process.resourceUsage(),
          eventLoop: {
            p95Ms: loop.percentile(95) / 1e6,
            p99Ms: loop.percentile(99) / 1e6,
            maxMs: loop.max / 1e6,
          },
          sqlite: store.prepare('select sqlite_version() version').get(),
        };
      });
    }
    app.addHook('preClose', () => service.close());
    app.addHook('onClose', () => lifecycle.release());
    await app.listen({ host: options.host ?? '127.0.0.1', port });
    return { app, store, service, auth, origin, close: () => app.close() };
  } catch (error) {
    return lifecycle.abort(error);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await createServer({
    port: Number(process.env.RILLDAY_PORT ?? 4287),
    file: process.env.RILLDAY_DB,
    diagnostics: process.env.RILLDAY_DIAGNOSTICS === '1',
    secret: process.env.RILLDAY_SECRET,
    publicUrl: process.env.RILLDAY_PUBLIC_URL,
    host: process.env.RILLDAY_HOST,
    clientOrigins: process.env.RILLDAY_CLIENT_ORIGINS?.split(',').filter(Boolean),
    webDir: process.env.RILLDAY_WEB_DIR,
  });
  console.log(JSON.stringify({ ready: true, origin: server.origin, pid: process.pid }));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }
}
