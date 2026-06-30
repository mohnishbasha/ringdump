# ringdump — Claude Code Instructions

## Project overview

TypeScript CLI tool that bulk downloads and archives Ring camera videos by date/time range and camera filter.
Wraps the `ring-client-api` npm package (unofficial Ring API client).

## Build & run

```bash
npm install          # install deps
npm run build        # tsc → dist/
node dist/index.js --help
```

For iterative dev without rebuilding:
```bash
npm run dev -- cameras
npm run dev -- download --from 2024-06-01 --to 2024-06-02
```

Requires `RING_REFRESH_TOKEN` env var at runtime. Never commit this value.

## Source layout

```
src/
  index.ts       — Commander CLI: defines commands (cameras, auth, download)
  downloader.ts  — Core logic: fetchAllEvents(), downloadVideos(), listCameras()
  auth.ts        — Auth helper: createRingApi() with 2FA support
```

## Key design decisions

- **`videoSearch()` first, `getEvents()` fallback** — `videoSearch` supports server-side date filtering; `getEvents` paginates with manual filtering. Both paths are in `fetchAllEvents()` in `downloader.ts`.
- **Raw HTTP download** — video URLs are pre-signed S3 links; we follow redirects and stream directly to disk via Node's `https` module. No extra deps.
- **Concurrency** — downloads within a camera run in parallel batches (default 3). Across cameras it's sequential.
- **Idempotent** — files with size > 0 are skipped on re-run.

## What NOT to do

- Do not add a GUI or web server — this is a CLI tool only.
- Do not store credentials anywhere except the env var `RING_REFRESH_TOKEN`.
- Do not add retry loops around the Ring API — the library handles token refresh internally.
- Do not change the output filename format without updating the docs; downstream scripts may depend on the `YYYYMMDD_HHMMSS_<kind>_<dingId>.mp4` pattern.

## Language & style

- TypeScript strict mode. All new code must pass `tsc` with zero errors.
- No comments unless the WHY is non-obvious. No docblocks.
- Prefer `async/await` over raw promises.
- No external HTTP clients (axios, got, node-fetch) — use Node's built-in `https`/`http`.
- `chalk` for terminal color. `commander` for CLI. No other UI deps.

## Testing

No automated test suite yet. Manual test protocol:
1. `npm run build` — must compile clean
2. `node dist/index.js cameras` — lists cameras (requires real token)
3. `node dist/index.js download --from YYYY-MM-DD --to YYYY-MM-DD --limit 2` — downloads 2 events

## Dependencies to avoid changing

`ring-client-api` version is pinned to `^12.0.0`. Do not upgrade without verifying the `videoSearch`, `getEvents`, and `getRecordingUrl` API shapes are unchanged.
