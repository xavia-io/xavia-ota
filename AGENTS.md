# AGENTS.md

Self-hosted Expo OTA update server and admin portal for item7go apps. Fork of
[xavia-io/xavia-ota](https://github.com/xavia-io/xavia-ota); `origin` is `Prince-Africa/xavia-ota`.

## Database: PostgreSQL only

- Every environment runs `DB_TYPE=postgres`. Supabase is not used.
- Do not extend, fix, or write migration notes for the Supabase code paths
  (`apiUtils/database/SupabaseDatabase.ts`, `apiUtils/storage/SupabaseStorage.ts`). They only need
  to keep compiling so `DatabaseFactory` / `StorageFactory` still build.
- Implement new data features in `apiUtils/database/LocalDatabase.ts` (the Postgres implementation).

## Schema changes

- Add a new file to `containers/database/migrations/` (`YYYYMMDD_description.sql`, idempotent,
  e.g. `ADD COLUMN IF NOT EXISTS`). `scripts/migrate-postgres.js` applies them in filename order
  before each deploy and refuses to run if an already-applied file changed, so never edit one.
- Mirror the change in `containers/database/schema/` (used to initialise fresh local databases)
  and add the file to the `migrate` target in `scripts/dev/Makefile`.

## Local development

- `npm run dev` starts the Postgres container, applies migrations, and serves on port 3001.
- `.env.local` uses `BLOB_STORAGE_TYPE=local`; release zips live in the git-ignored
  `local-releases/updates/<runtimeVersion>/<timestamp>.zip`. The releases list is built from those
  files and joined to the `releases` table by `path`.

## Checks

Husky hooks may not run on every machine, so run these yourself before pushing:

- `npm test`, `npm run lint`, `npx tsc --noEmit -p .`
- Commit messages follow Conventional Commits and are checked by commitlint; body lines must be
  100 characters or fewer (`npx commitlint --from HEAD~1 --to HEAD`).

## Update delivery

- Phones must not pay for unzipping or hashing. `apiUtils/helpers/ReleaseAssetCache.ts` works out
  each release's asset hashes, keys and Expo config once (at upload, or on first request after a
  restart), and unpacks each asset plus a gzip copy to `ASSET_CACHE_DIR`. `/api/manifest` and
  `/api/assets` read from that cache; keep new per-request work out of the zip.
- Asset responses are `Cache-Control: public, max-age=31536000, immutable`: a URL names one
  update's copy of a content-hashed file. A shared cache or CDN in front would stop those requests
  reaching `recordAssetRequest`, so the dashboard's asset counters would undercount.
- `DatabaseFactory.getDatabase()` returns one shared instance; it owns the Postgres pool.

## Admin portal UI

- Dark-only item7go brand theme. Colour tokens (surfaces, `line`, `muted`, brand red `primary`,
  `verified`, `warning`) live in `pages/ChakraProvider.tsx`; use tokens rather than raw hex.
- Brand red is an accent: active nav marker, primary buttons, one hairline on the dashboard card.
  Don't use it for large surfaces.
- Type: Archivo set wide (`fontStretch: 125%`) for headings, Archivo for body, JetBrains Mono for
  hashes, versions, sizes and counts (`styles/fonts.ts`).
- The loading state is the GO spinner (`public/go_loader.gif`, from item7-mobile) via
  `components/LoadingSpinner.tsx`.
- `pages/_app.tsx` defines `getInitialProps` on purpose: it makes pages render per request so
  `pages/_document.tsx` can build absolute link-preview URLs from the runtime `HOST`, which is not
  set during the Docker build. Don't remove it.

## Releases and commit links

- `scripts/build-and-publish-app-release.sh` runs inside an app repo and uploads the build with its
  commit hash, message, and `git remote get-url origin`. The server normalises the remote with
  `RepositoryHelper.toBrowserUrl` and stores it per release in `releases.repository_url`, so
  releases from different app repos each link to their own commits.
- Phones receive the newest release for their own runtime version
  (`getLatestReleaseRecordForRuntimeVersion`), not the newest release overall.
