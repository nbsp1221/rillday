# Rillday server

The server provides authentication, private accounts and native document synchronization through Node.js 24, Fastify, Better Auth and SQLite. It serves the web application and API together.

For Docker installation, HTTPS, account setup, updates and recovery, use the [self-hosting guide](../../docs/self-hosting.md). For application and module boundaries, see [architecture](../../docs/architecture.md).

## Run from source

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build:web
pnpm start
```

The default address is `http://127.0.0.1:4287`. The default database is `../data/rillday-server/data.sqlite`, relative to the repository root. Set an absolute `RILLDAY_DB` for a deployment or isolated test.

## Configuration

Set process environment variables before starting the server:

- `RILLDAY_HOST`: listen address, default `127.0.0.1`.
- `RILLDAY_PORT`: listen port, default `4287`.
- `RILLDAY_PUBLIC_URL`: external HTTP(S) origin, default `http://127.0.0.1:4287`. Paths, query strings and embedded credentials are rejected.
- `RILLDAY_DB`: SQLite database file. Its directory must be writable and persistent.
- `RILLDAY_WEB_DIR`: built web directory, default `apps/web/dist/`. Use an absolute path when deploying outside the checkout.
- `RILLDAY_CLIENT_ORIGINS`: optional comma-separated additional web origins. The served web origin and packaged Tauri origins are allowed without an extra entry.
- `RILLDAY_DIAGNOSTICS`: set to `1` to enable authenticated runtime diagnostics.

The database stores the generated instance identity and authentication secret. Preserve it when updating. Compose's host binding and release-version variables are described in the [installation configuration](../../docs/self-hosting.md#configuration); they are separate from process settings.

## Maintenance from source

Run these commands from the repository root, with `RILLDAY_DB` selecting the database:

```sh
pnpm server:maintenance backup /absolute/path/rillday-backup.sqlite
pnpm server:maintenance restore /absolute/path/rillday-backup.sqlite /absolute/path/restored.sqlite
```

Backup uses SQLite's online backup API. Choose a new backup filename in an existing directory. Restore writes to a new database; stop the server before switching to it. Backups include account data and authentication secrets; follow the [backup and restore guide](../../docs/self-hosting.md#back-up-and-restore).

To reset an account password, pipe a new 12–128 character password from a protected input source into:

```sh
pnpm server:maintenance reset-password user@example.com
```

Passwords are read from standard input, never command arguments. Do not write them into shell history or logs. A password reset revokes the account's sessions and preserves its workspace.

## HTTP and synchronization

- `GET /health` is a public HTTP health check.
- `GET /v1/openapi` provides the HTTP API schema.
- Authenticated native document replication uses WebSockets under `/v1/workspace/`.
- HTTP bodies and native WebSocket messages have a 64 MiB ceiling. This is a payload limit, not a memory guarantee.

The server authenticates each account's document traffic and persists opaque native snapshots. It does not execute task or habit actions. SQLite WAL and FULL synchronous commits precede persistence acknowledgments.

Fastify/Pino produces structured JSON logs with request IDs, route templates, status and duration. Unexpected failures include stack frames; request bodies, headers, query strings and error messages are omitted. Let the host capture and rotate logs.

## Tests

```sh
pnpm --filter @repo/server test
```

Vitest suites use synthetic accounts and isolated databases. Set `RILLDAY_TEST_OUTPUT` for an external artifact directory. See [development and testing](../../docs/development.md#checks) for the full workspace and browser checks.
