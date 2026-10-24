import { spawn } from 'node:child_process';
import { once } from 'node:events';

interface ServerProcessOptions {
  file: string;
  port: number;
  entryPoint: string;
}

export function launchServer({ file, port, entryPoint }: ServerProcessOptions) {
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [entryPoint], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      RILLDAY_PORT: String(port),
      RILLDAY_DB: file,
      RILLDAY_DIAGNOSTICS: '0',
      RILLDAY_PUBLIC_URL: origin,
      RILLDAY_HOST: '127.0.0.1',
      RILLDAY_CLIENT_ORIGINS: '',
    },
  });
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const ready = new Promise<void>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => fail(new Error('Test server startup timed out')), 30_000);
    timeout.unref();

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onOutput);
      child.off('exit', onExit);
      child.off('error', fail);
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null) =>
      fail(new Error('Test server exited ' + String(code) + ': ' + errors));

    const onOutput = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('"ready":true')) {
        cleanup();
        resolve();
      }
    };

    child.stdout.on('data', onOutput);
    child.once('exit', onExit);
    child.once('error', fail);
  });
  return {
    child,
    origin,
    ready,
    async stop() {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = once(child, 'exit');
      const terminate = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
      terminate.unref();
      child.kill();
      try {
        await exited;
      } finally {
        clearTimeout(terminate);
      }
    },
  };
}
