# Bundle diffing

Xavia serves BSDIFF40 patches to compatible expo-updates clients. SDK 56 and later
request these by default unless patch support was disabled in the native build.
No mobile publishing-script change is required. Deploy the database migration
before starting the updated server.

## Delivery

The client requests its launch asset with `A-IM: bsdiff` and
`Expo-Current-Update-ID`. Xavia resolves that exact base release within the target
runtime, then selects the same platform's bundle. This supports skipped releases
and rollback publications, not just the immediately previous upload.

Patches are generated during upload against the three most recent completed
releases of the same runtime (active release first), for iOS and Android. Xavia
creates a release row in `uploading` state, validates/caches its assets, stores the
full ZIP, generates patches, persists useful patch objects and their database
references, and only then activates the release. The uploading row is needed to
associate the patch references; phones cannot receive it until activation.

Before saving a patch, Xavia applies it using the decoder shipped by Expo and
checks the reconstructed target's SHA-256 against the manifest. A patch is kept
only if it is at least 10% smaller than the full transfer, including gzip when
available. Each fresh upload response includes `bundlePatches` with `ready`,
`patchBytes`, and `fullBytes`. The byte totals sum all retained base/platform
pairs; they are not the total size downloaded by an individual phone.

Patch objects live in durable storage under `bundle-patches/`, and the
`release_bundle_patches` table associates each object with a base release, target
release, platform, hashes and byte size. Downloads only look up these references
and fetch the prepared bytes. There is no diff generation or base ZIP extraction
on a download request. A bounded local patch cache avoids repeated storage reads;
eviction or server restart does not lose the prepared patch objects.

The patch response is HTTP 226 with `IM: bsdiff` and `Expo-Base-Update-ID`.
Launch-asset responses use private/no-store caching to avoid mixing base-specific
patches and full bundles in shared caches. Stored patch bytes are hash-checked
before serving; corrupt or missing objects fall back to a full bundle.

The full bundle remains available for clients without patch support, unknown or
unavailable bases, missing platforms, failed tools, or patches that save too
little. Bases outside the upload-time selection receive a full bundle. Client
retries without `A-IM` always receive the full bundle. Fresh
installs whose embedded update is unknown to Xavia receive a full bundle; later
published updates can use patches. Images and fonts retain ordinary asset reuse.
The uploader still sends the complete release ZIP.

## Deployment and local development

Apply the versioned database migrations before running the new server, then
rebuild and redeploy the Docker image. The new migration is
`containers/database/migrations/20261028_bundle_patches.sql` and is included by
`scripts/migrate-postgres.js`. Fresh database schemas include the table too.
The Docker patch-tools stage builds the vendored
BSD-licensed tools and installs the binaries and bzip2 runtime library in the
runner. Existing stored releases are eligible as bases for subsequent uploads.
Existing
target releases are not backfilled automatically.

For a server running outside Docker, install a C compiler and bzip2 development
headers, then build both tools (from the repository root):

```sh
mkdir -p /tmp/xavia-patch-tools
cc -O2 vendor/bsdiff/bsdiff.c -lbz2 -o /tmp/xavia-patch-tools/bsdiff
cc -O2 -Dbspatch_main=main vendor/bsdiff/bspatch.c -lbz2 -o /tmp/xavia-patch-tools/bspatch
export BSDIFF_BINARY=/tmp/xavia-patch-tools/bsdiff
export BSPATCH_BINARY=/tmp/xavia-patch-tools/bspatch
```

Settings:

- `BUNDLE_DIFFING_ENABLED=0` disables patch serving immediately; enabled by default.
- `BSDIFF_BINARY` / `BSPATCH_BINARY` override the executable paths (defaults: PATH).
- Patches live under `ASSET_CACHE_DIR/bundle-patches-v1` and are disposable.

Each process generates one patch at a time during upload, even if uploads
overlap. Each tool has a 15-second timeout. Bundles larger than 32 MiB use full
downloads to bound diff memory. At most six patches are attempted per upload
(three bases times two platforms), so upload processing takes longer. Ensure the
upload proxy timeout permits this processing time.

Generation/verification failures skip that pair and keep the full-bundle path.
Failures to persist a retained patch or its DB reference fail the release before
activation; the previous active release remains available. Prepared objects are
immutable and reused across processes. Failed uploads can leave unreferenced
objects, which can be reclaimed separately under a storage retention policy.

The local cache retains up to 128 patch files; deleting it is safe. Durable patch
objects follow release retention and should not be deleted while their database
references are in use.

## Verification

`npm test -- --runInBand` includes binary round-trip tests using Expo's decoder
for both platform paths, cache reuse, unavailable bases/tools, failed validation,
size thresholds, upload-before-activation ordering, storage recovery, HTTP
negotiation, and byte accounting. Tests require `cc` and
bzip2 headers (macOS command line tools, or `build-essential libbz2-dev` on Debian).
Also run `npm run lint` and `npx tsc --noEmit -p .`.

After deployment, use a release build running a known published update and
publish a small JS change with the same runtime version. Confirm the bundle
request has `A-IM: bsdiff`, returns 226, and the upload response reports prepared
patches. The upload logs include
`Prepared release bundle patches before activation`; download requests should
never log new patch generation. The existing transfer metrics count the
actual patch response bytes. Check `Updates.readLogEntriesAsync()` for the
client's successful diff application, then repeat with an older base and with
patch serving disabled to exercise fallback. This device check is required to
confirm the deployed server, proxy, and installed native client work together.
