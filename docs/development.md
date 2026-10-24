# Development

Use Node.js 24 and pnpm 11.25.0. Install dependencies from the repository root with `pnpm install --frozen-lockfile`. pnpm downloads the project's pinned Node.js runtime and uses it for `pnpm run` and `pnpm exec`, including workspace commands. Keep `pnpm-lock.yaml` and `apps/desktop/src-tauri/Cargo.lock` so dependency resolution is reproducible.

`pnpm-workspace.yaml` records native install-script permissions. Turbo runs workspace checks in dependency order and caches build outputs.

Private workspace packages use `@repo/*` names independently of product branding. Declare their dependencies with `workspace:*` and import through their package exports.

## Web

```sh
pnpm dev
```

The frontend development server uses `http://127.0.0.1:4173`. The application server serves the built web app and API together on port 4287. Installed users do not need the frontend development server.

For synchronization from a separate development renderer, set the server's `RILLDAY_CLIENT_ORIGINS` to its exact origin. `http://127.0.0.1:4173,http://127.0.0.1:1420` allows both local development hosts. The served web build and packaged Tauri origins need no additional entry.

`?demo=1` opens synthetic sample data in separate browser storage. Its changes survive reload, and it does not reset or modify the normal workspace. Browser origins, including ports, have independent local storage.

## Server

Build the web app, then start the server from the repository root:

```sh
pnpm build:web
pnpm start
```

Open `http://127.0.0.1:4287`. Use the [server README](../apps/server/README.md) for process configuration and source maintenance commands. The [self-hosting guide](self-hosting.md) covers the distributed container, account setup, HTTPS, upgrades and recovery.

## Persistence schemas

Product schemas live beside their rules in `packages/domain/src`. The server stores opaque Automerge document snapshots in `apps/server/src/schema/tables.sql`; it does not generate product tables. Better Auth owns its account/session schema. Keep account constraints and native-document storage changes in their owning server modules.

## Landing and public demo

`apps/landing` owns the static product site. `apps/demo` is a separate browser host of the shared frontend, with sample data and its own IndexedDB namespace. It does not create a credential session or expose server/account actions. The regular web and desktop hosts retain their normal connection capabilities.

```sh
pnpm --filter @repo/landing dev
pnpm --filter @repo/demo dev
```

The local sites use ports 4174 and 4175 respectively. Build each with `pnpm --filter @repo/landing build` or `pnpm --filter @repo/demo build`, then use its `preview` command. Their package-owned `test:e2e` commands exercise the built output, including offline demo use and reset across tabs. The demo reset uses the same archive/domain flow as the product and affects only the demo workspace.

Both sites use Workers Static Assets without a Worker script, database or hosted account service. Their `wrangler.jsonc` files declare the separate custom domains. Run `pnpm --filter @repo/landing exec wrangler deploy --dry-run` and the equivalent demo command to validate packaging locally. Publishing requires an explicit deployment action and Cloudflare access; a build or dry run does not publish a site.

Brand assets are generated with `pnpm build:icons`. Product screenshots live in `apps/landing/public/screenshots` and are shared by the landing page and README. Replacing those images invalidates the landing build cache. No tracking, remote fonts or visitor-time GitHub API calls are included.

## Packaging and releases

Build and verify the self-hosted image from the repository root:

```sh
docker build -t rillday:local .
node apps/server/tests/container/smoke.mjs rillday:local
```

The container check uses a temporary loopback registry, a separate Compose project, synthetic accounts and an isolated volume. It exercises installation, image replacement, online backup, restore and password recovery. It removes its containers and volumes and retains results under `apps/server/.cache/tests/`. Image replacement verifies persistence across container recreation; it does not establish compatibility with future database schema changes.

Windows builds produce an NSIS installer. Run `apps/desktop/tests/installer.ps1` only in a disposable Windows user profile or VM; it rejects existing application data or installation records. CI verifies installation and reinstallation there. `scripts/prepare-release.mjs INSTALLER OUTPUT_DIRECTORY` prepares the installer, Compose and version-pinned environment example with `SHA256SUMS`.

Set the root package version before pushing a matching `vMAJOR.MINOR.PATCH` tag. The release workflow requires the complete CI workflow, publishes AMD64/ARM64 images to GHCR and creates a draft GitHub release with the installation files. Review and publish the draft. The first GHCR package must have public visibility for anonymous installation. A manual release-workflow run performs verification without publishing images or creating a release.

## Windows

Windows development requires Rust, MSVC build tools and WebView2 in addition to Node.js.

Release builds also use cargo-about to collect the native dependency licenses:

```sh
cargo install cargo-about --version 0.9.2 --locked --features cli
```

Tauri supplies the build target to the license generator. For standalone `pnpm licenses:desktop` runs, set `CARGO_BUILD_TARGET` explicitly.

```sh
pnpm dev:desktop
```

This command starts the frontend server itself. The desktop renderer uses port 1420; browser development uses port 4173.

```sh
pnpm build:desktop
```

The build generates application icons, embeds its own renderer and creates the Windows NSIS installer under `apps/desktop/src-tauri/target/release/bundle/nsis/`. The unbundled application is `apps/desktop/src-tauri/target/release/rillday-desktop.exe`; it requires WebView2. See the [Windows guide](windows.md) for installation, updates and local data.

## Brand assets

`packages/frontend/src/presentation/shared/assets/brand/icon.svg` is the shared application-icon source. Run `pnpm build:icons` after editing it. Tauri generates the native icon set, the web favicon, the opaque Apple touch icon and the regular and maskable web-app icons. Commit the generated web and desktop public assets with the source; native outputs remain ignored and are regenerated for desktop builds. The web manifest is defined in `apps/web/vite.config.ts`.

Product colors live in `packages/frontend/src/presentation/app/entrypoint/workspace.css`; the UI package supplies the shared shadcn base layer. Keep solid-button foregrounds separate from light/dark emphasis foregrounds, and preserve semantic priority, error and user-selected colors.

## Checks

```sh
pnpm check
pnpm test
pnpm test:e2e
```

`check` runs Oxfmt, Turbo package boundaries, Oxlint followed by ESLint, and TypeScript. `pnpm check:boundaries` checks package dependencies and isolation through Turbo. Oxlint checks production imports of server/test-support APIs; TypeScript resolves imports and package exports, including side-effect imports. ESLint uses the shared retn0 presets with Oxlint's duplicate-rule suppression. Use `pnpm format` and `pnpm lint:fix` for supported automatic corrections, then review the changes.

`test` delegates unit and integration suites to package-owned Vitest runners through Turbo. Put unit tests beside the implementation as `module.test.ts` or `module.test.tsx`. Vitest's default discovery finds both forms without an `include` override. Group tests by the behavior they protect, rather than by the refactoring that introduced them.

Keep IndexedDB, SQLite, HTTP and process-recovery integration scenarios in the owning package's `tests/`, grouped by feature. Cross-package HTTP synchronization belongs to `packages/frontend/tests/sync/`, alongside its concrete IndexedDB adapters. Feature modules may keep their own focused integration tests alongside their adapters. Test location describes ownership; the dependencies exercised determine whether a case is a unit or integration test.

Keep local helpers in the owning tests' `support/` directory, such as `tests/support/` or `tests/sync/support/`. Use `scripts/` for development commands. Package-wide test initialization belongs in `tests/setup.ts`; feature-specific initialization stays beside the tests that use it. Keep cross-package test helpers in `packages/test-support`.

Run one owner with `pnpm --filter @repo/domain test` or `pnpm --filter @repo/frontend test`. For a focused unit test, use `pnpm --filter @repo/frontend exec vitest run src/application/workspace/habits.test.ts`; for an integration feature, use `pnpm --filter @repo/frontend exec vitest run tests/sync/native-sync.test.ts`. Omit `run` for watch mode. Helpers use ordinary filenames and are not discovered as tests.

`apps/web/playwright.config.ts` and `apps/web/e2e/` own browser cases and browser-only support. `packages/test-support` provides synthetic accounts, artifact cleanup and an injected server fixture; production modules never import it. The fixture accepts its consumer's server factory to avoid a dependency cycle.

Turbo caches deterministic local suites using their dependency graph, test sources and semantic environment. Keep caches scoped to the same runtime and platform. Server, system synchronization and E2E checks always execute. `pnpm test:all` runs Vitest and Playwright suites.

Cached web builds always write to `apps/web/dist`. For an isolated build, use Vite directly: `pnpm --filter @repo/web exec vite build --outDir <directory>`. Set `RILLDAY_TEST_WEB_DIR` to that directory when running browser tests; their preview server inherits it.

CI runs on pull requests and pushes to `main`, cancelling superseded runs for the same ref. Formatting, lint, types and the full Vitest suite run first; browser E2E and desktop checks start only after those pass. Desktop checks compile on Linux and build the Windows application through `build:desktop`, including its renderer and native license output. The `web` status requires checks, browser verification and both desktop jobs to succeed. Native build checks do not replace installation and OS-integration tests.

Server tests clean up their temporary databases. Set `RILLDAY_TEST_KEEP_ARTIFACTS=1` to retain them for debugging. `RILLDAY_TEST_OUTPUT` selects fixture artifacts; Vitest keeps its default cache location.

Browser tests use headless Microsoft Edge on Windows and Chromium on Linux. Install Chromium with `pnpm --filter @repo/web exec playwright install --with-deps chromium`; `RILLDAY_TEST_BROWSER` selects a Playwright Chromium channel, such as `msedge` or `chrome`. The value `chromium` keeps Playwright's default headless shell. The tests use fresh browser contexts and do not connect to an existing browser profile. `RILLDAY_TEST_PORT` overrides the preview's default port 4181. Real-server fixtures allocate isolated ports. Do not reuse a server with real data for automated tests. `RILLDAY_TEST_OUTPUT` selects an external directory for generated test artifacts, partitioned by suite owner. `RILLDAY_TEST_WEB_DIR` selects prebuilt web assets for isolated browser verification.

Playwright starts the preview server, waits for its HTTP response and stops it after the run.

## Generated files

Generated output is ignored by Git:

- Browser renderer: `apps/web/dist/`.
- Desktop renderer: `apps/desktop/dist/`.
- Rust builds: `apps/desktop/src-tauri/target/`.
- Temporary databases and benchmark reports: the running owner's `.cache/tests/`.
- Browser results and HTML reports: `apps/web/.cache/tests/web-e2e/`.

Web builds generate `THIRD_PARTY_LICENSES.md` and include the source `LICENSE`. Desktop release builds additionally generate `THIRD_PARTY_RUST_LICENSES.html` in the desktop renderer output before Tauri embeds it.

The default server database remains outside the checkout at `../data/rillday-server/data.sqlite`. Set `RILLDAY_DB` explicitly for deployment or isolated testing; see the [server guide](../apps/server/README.md#configuration).
