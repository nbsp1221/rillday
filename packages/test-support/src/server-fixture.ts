import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { removeOwned, tempDir } from './artifacts.ts';

export async function freePort(port = 0) {
  const socket = createNetServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(port, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an allocated TCP port');
  }
  await new Promise<void>((resolve, reject) => {
    socket.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

interface FixtureOptions {
  label?: string;
  webDir?: string;
}

interface ServerOptions extends FixtureOptions {
  port: number;
  file: string;
  diagnostics: boolean;
}

interface ClosableServer {
  close(): Promise<unknown>;
}

// Inject the consumer's server factory so this package cannot depend on its users.
export function createServerFixture<Server extends ClosableServer>(
  createServer: (options: ServerOptions) => Promise<Server>,
) {
  return async function fixture(options: FixtureOptions = {}) {
    const dir = tempDir(options.label ?? 'case-');
    try {
      let server: Server | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          server = await createServer({
            port: await freePort(),
            file: resolve(dir, 'data.sqlite'),
            diagnostics: true,
            ...(options.webDir ? { webDir: options.webDir } : {}),
          });
          break;
        } catch (error) {
          if (
            !(error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') ||
            attempt === 4
          ) {
            throw error;
          }
        }
      }
      if (!server) {
        throw new Error('Could not create the synthetic server');
      }
      const active = server;
      return {
        ...active,
        dir,
        async dispose() {
          try {
            await active.close();
          } finally {
            removeOwned(dir);
          }
        },
      };
    } catch (error) {
      removeOwned(dir);
      throw error;
    }
  };
}
