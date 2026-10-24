# Self-hosting

One Rillday server provides the web application, accounts and synchronization API. It uses SQLite and needs no separate database or cache service. Windows local-only use needs no server; see the [Windows guide](windows.md).

## Install with Docker Compose

Install Docker Engine and the Docker Compose plugin. Create an installation directory and download the files from the same release:

```sh
mkdir rillday
cd rillday
curl --fail --location --output compose.yaml \
  https://github.com/nbsp1221/rillday/releases/latest/download/compose.yaml
curl --fail --location --output .env \
  https://github.com/nbsp1221/rillday/releases/latest/download/example.env
```

You can also download `compose.yaml` and `example.env` from the [release page](https://github.com/nbsp1221/rillday/releases/latest) in your browser. Save `example.env` as `.env` beside `compose.yaml`. No source checkout, Node.js or pnpm installation is needed.

The environment file pins the release version. Review its public URL and network settings, then start Rillday:

```sh
docker compose up -d
docker compose ps
```

Open **http://127.0.0.1:4287/** on the server computer. The default port binding accepts connections only from that computer. A browser on a different computer cannot reach the server using its own `127.0.0.1` address.

For remote access, configure [HTTPS](#https-and-remote-access) and a reachable public URL. Complete administrator setup through controlled access before allowing other people to reach the server.

## First administrator and accounts

Open **Settings → Sync**, check the server address and create the first administrator. **The first successful setup request becomes administrator. Complete this step before exposing the server to other people.** Concurrent setup requests cannot create a second administrator.

The administrator adds ordinary accounts from Settings → Sync. Public registration is disabled. A server supports up to **10 accounts**, including its administrator. Each account owns private workspace data; administrator access manages accounts rather than granting access to other users' workspace APIs.

Opening the website does not connect an account. Without a connection, work stays in that browser. In the Windows application, it stays in the Windows application profile.

To synchronize, connect the same server account on each device. If local work exists, review whether to include it or open server data while retaining the local source. Disconnecting asks whether to retain or remove the device copy, preserves server originals and prevents silent removal of unsent edits.

## Configuration

Compose reads `.env` beside `compose.yaml`. The release file supplies a pinned image version and defaults for local access.

- `RILLDAY_VERSION`: exact container version, such as `0.1.0`. Change it deliberately when upgrading.
- `RILLDAY_PUBLIC_URL`: the browser-facing HTTP(S) origin, with no path, query or credentials. The local default is `http://127.0.0.1:4287`.
- `RILLDAY_BIND`: the host address that exposes the container port. The default is `127.0.0.1`. Change it only when you intend to expose the service on another interface.
- `RILLDAY_PORT`: the host port, default `4287`. Update the public URL too if this changes the address used by clients.
- `RILLDAY_DB`: the database file inside the container, default `/data/data.sqlite`. Keep it inside the mounted `/data` directory.

The container listens on `0.0.0.0:4287` internally. Its internal listen address and port are separate from the host's published address. The Compose service is named `rillday` and stores persistent data in its data volume. Keep the same Compose project name and volume when recreating containers.

The database contains accounts, synchronized workspaces, the server identity and its authentication secret. Do not recreate it as part of an application update. Keep the volume on local storage with reliable file locking; do not place a live SQLite database on a network share.

For non-container deployments and additional process settings, see the [server configuration](../apps/server/README.md#configuration).

## HTTPS and remote access

Use a dedicated HTTPS origin, for example `https://planner.example.com`, and set `RILLDAY_PUBLIC_URL` to that origin. Choose the address before creating browser-local work: changing its scheme, hostname or port selects different browser storage.

Place an HTTPS reverse proxy in front of Rillday. Forward the web assets, `/api/`, `/v1/` and `/health` to the same application service. Allow WebSocket upgrades and long-lived connections under `/v1/workspace/`. HTTP bodies and native synchronization messages have a 64 MiB ceiling; configure compatible proxy limits if handling large workspaces.

If the proxy runs on the same host, retain the loopback port binding. If the proxy runs in a separate container, connect it through an appropriate Docker network; `127.0.0.1` inside that proxy refers to the proxy container. Expose only the intended service path through your firewall.

HTTPS is required for browser offline support outside localhost. An HTTPS page cannot connect to an HTTP synchronization server because of browser mixed-content rules. Prefer using the web app served by its own Rillday server. The Windows application connects to the same reachable HTTPS address through Settings → Sync.

## Update

1. Read the release notes for client requirements and database changes.
2. Make a [database backup](#back-up-and-restore) and copy it out of the data volume.
3. Download the Compose and environment examples for the target release. Review changes while retaining your public URL, database path, project name and volume.
4. Set `RILLDAY_VERSION` in `.env` to the target version, then run:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

Verify sign-in, existing work and synchronization before discarding the previous backup. Updating the container does not update Windows clients; install compatible client releases separately.

Do not use `docker compose down -v` to update: it removes the data volume. Downgrading an image does not reverse database changes. If a rollback is necessary, use the earlier image with a matching pre-upgrade database backup and follow its release notes.

## Back up and restore

Synchronization propagates changes and deletions. It does not replace independent backups. Browser and Windows exports protect local workspace data; a server backup also contains accounts and authentication information.

### Back up

Use SQLite's online backup API through the maintenance command:

```sh
docker compose exec rillday node /app/apps/server/src/maintenance.ts \
  backup /data/rillday-backup.sqlite
docker compose cp rillday:/data/rillday-backup.sqlite ./rillday-backup.sqlite
```

Use a new destination filename for each backup; the command does not overwrite existing files. The server can remain running during online backup. Do not copy only the live database file while it is open, because committed data may also be in its WAL file.

Protect the copied backup like the live database: it includes private data and authentication secrets. Retain a copy outside the server and its data volume. A backup left only in `/data` does not protect against loss of that volume.

### Restore

Stop Rillday and copy the backup into its data volume. Use new source and destination filenames if either already exists:

```sh
docker compose stop rillday
docker compose cp ./rillday-backup.sqlite rillday:/data/restore-source.sqlite
docker compose run --rm --no-deps rillday \
  node /app/apps/server/src/maintenance.ts \
  restore /data/restore-source.sqlite /data/restored.sqlite
```

Restore checks database integrity and foreign keys and writes a new database file. Keep the original database. Set `RILLDAY_DB=/data/restored.sqlite` in `.env`, then recreate the application service:

```sh
docker compose up -d
```

Verify accounts, workspace data and a reconnecting device before removing the original files. Offline devices retain their own edits and can merge them back after reconnecting; restoring the server does not erase those device copies.

## Password recovery

Users can change their own password in Settings → Sync. An operator with access to the server can reset a password using the maintenance command:

```sh
docker compose exec -T rillday node /app/apps/server/src/maintenance.ts \
  reset-password user@example.com
```

Pipe the new **12–128 character** password into this command from a protected input source. Do not put passwords in command arguments, shell history or logs. The command revokes all sessions for that account and preserves its role and workspace. Devices must sign in again; their offline work remains local until they reconnect.

## Troubleshooting

### Check the service

```sh
docker compose ps
docker compose logs --tail 100 rillday
curl --fail http://127.0.0.1:4287/health
```

Use the configured host port if you changed it. `/health` confirms the HTTP service responds; also verify the web interface and an authenticated synchronization connection. Logs use structured JSON. Review logs for sensitive information before sharing them in an issue.

### A device cannot connect

Check its server address, HTTPS certificate, firewall and proxy WebSocket settings. Confirm `RILLDAY_PUBLIC_URL` matches the public origin. Use the server's reachable address on other devices, not their local loopback address.

### Browser data appears missing

Check that the scheme, hostname, port, browser profile and connected account are the same. Guest data belongs to that browser origin. Export from the original origin before moving local work to another address.

### Storage is unavailable

Check free disk space and that the application can write to its data volume. Preserve the database and local device data while investigating. Do not reset the volume to resolve a sign-in or connection error.
