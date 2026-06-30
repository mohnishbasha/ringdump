# Product Requirements Document — ring-backup

## Problem

Ring's mobile app and web dashboard let you browse and play recordings, but offer no bulk download mechanism. Users who want to:
- archive footage before it ages off (Ring stores 60–180 days depending on plan)
- migrate away from Ring
- run local video analysis or backup pipelines

…have no official tooling. Manual download is click-by-click, one video at a time.

## Goal

A local CLI tool that can bulk-download Ring camera recordings filtered by date range and camera, with no cloud intermediary beyond Ring's own API.

## Users

| Persona | Need |
|---------|------|
| Home owner archiving footage | Download last 30 days before subscription lapses |
| Security-conscious user | Local copy of all footage, no dependence on Ring cloud retention |
| Developer / home-automation user | Automate periodic backup via cron |

## Non-goals

- Real-time / live streaming (Ring's live view is WebRTC; separate concern)
- Video editing or transcoding beyond what Ring already provides
- Multi-account or shared-location scenarios (single account only)
- GUI or web interface

## Functional requirements

### FR-1: Authentication
- Must accept a Ring refresh token via environment variable `RING_REFRESH_TOKEN`
- Must provide an `auth` command that prints a usable refresh token from email + password (+ optional 2FA)
- Token must never be written to disk by the tool itself

### FR-2: Camera listing
- `cameras` command must list all cameras with ID, name, and device type
- Output must be human-readable in the terminal

### FR-3: Video download
- `download` command must accept:
  - `--from` and `--to` date/time bounds (flexible format: date-only, datetime, ISO 8601)
  - `--camera` filter (partial match on name or ID; omit = all cameras)
  - `--kind` filter (`motion` | `ding` | `all`)
  - `--output` directory (default `./ring-videos`)
  - `--limit` max events per camera
  - `--transcoded` flag for Ring-watermarked video vs. raw
  - `--concurrency` for parallel downloads per camera
- Must skip files that already exist and are non-empty (idempotent reruns)
- Must print per-file status: downloaded, skipped, or failed with reason

### FR-4: Output structure
- Files saved as `<output>/<CameraName>/<YYYYMMDD_HHMMSS>_<kind>_<dingId>.mp4`
- Camera name directory is sanitized (spaces → underscores, special chars stripped)

### FR-5: Error handling
- Missing token → clear error message with instructions
- Camera filter matches nothing → list available cameras and exit cleanly
- Individual download failure → log and continue; do not abort the batch
- Network errors → surface the error per file; do not crash

## Non-functional requirements

- **No cloud dependency** beyond Ring's own API — no S3 buckets, no databases, no external services
- **Zero runtime cost** — runs locally, no server process
- **Idempotent** — safe to re-run; already-downloaded files are untouched
- **Small footprint** — no heavy dependencies (no ffmpeg required for download, no browser automation)
- **Node 18+ compatible** — matches ring-client-api engine requirement

## Technical approach

| Concern | Decision |
|---------|----------|
| Language | TypeScript (matches ring-client-api ecosystem) |
| Ring API | `ring-client-api` unofficial library |
| Download | Node built-in `https` + redirect following |
| Date filtering | `videoSearch({ dateFrom, dateTo })` → fall back to paginated `getEvents` |
| CLI framework | `commander` |
| Color output | `chalk` v4 (CommonJS-compatible) |

## Success metrics

- Can download 100+ videos in a single run without manual intervention
- Re-running the same command downloads zero duplicate files
- A user with no Ring API knowledge can get their first token and first download working within 5 minutes following the README

## Future work (out of scope for v1)

- Cron-friendly `--since-last-run` mode using a state file
- Config file (`.ring-backup.json`) to persist defaults
- Progress bar for large batches
- Support for Ring's periodic/continuous recording (separate API path)
- Parallel processing across cameras (currently sequential per camera)
- Webhook / notification on completion
