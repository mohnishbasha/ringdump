# Skills — ring-backup

Capability inventory for this project: what the tool can do, what it cannot,
and what each source file is responsible for.

---

## CLI commands

| Command | Description | Key flag(s) |
|---------|-------------|-------------|
| `cameras` | List all Ring cameras (ID, name, device type) | — |
| `auth` | Authenticate and print a refresh token | `-e`, `-p`, `--2fa` |
| `download` | Bulk-download videos by date range and camera | `--from`, `--to`, `--camera`, `--kind` |

---

## Core capabilities

### Date range filtering
`--from` and `--to` accept three formats:
- `YYYY-MM-DD` — treated as local midnight
- `YYYY-MM-DD HH:MM` — local time
- ISO 8601 (`2024-06-15T08:30:00Z`) — UTC

Internally converted to millisecond timestamps and passed to `camera.videoSearch()`.

### Camera filtering
`--camera` does a case-insensitive substring match against camera name or numeric ID.
Matches multiple cameras if the string appears in more than one name.
Prints the full camera list when no match is found.

### Event type filtering
`--kind motion` — only motion-triggered recordings
`--kind ding` — only doorbell press recordings
`--kind all` (default) — both

### Parallel downloads
Within a single camera, up to `--concurrency` (default 3) files download simultaneously.
Across cameras, processing is sequential.

### Idempotency
Before downloading, checks if the destination file exists and has size > 0.
If yes, skips and counts as "already existed" in the summary.

### Transcoded vs. raw video
Ring stores two versions of each recording:
- **Raw** (`--transcoded` omitted): original MP4 from the camera sensor, no overlay
- **Transcoded** (`--transcoded`): Ring-processed with timestamp and logo burned in

Default is raw. Use `--transcoded` if you want the timestamp visible in the video file itself.

---

## Source responsibilities

### `src/index.ts`
- Defines all CLI commands via `commander`
- Parses and validates flags (dates, kind, concurrency)
- Calls into `downloader.ts` and `auth.ts`
- Owns exit codes and top-level error formatting

### `src/downloader.ts`
- `fetchAllEvents(camera, from, to, kind, limit)` — tries `videoSearch` first, falls back to paginated `getEvents`
- `downloadFile(url, destPath)` — streams HTTP response to disk, follows redirects
- `downloadVideos(api, opts)` — orchestrates across cameras; returns `DownloadResult[]`
- `listCameras(api)` — formats and prints camera list

### `src/auth.ts`
- `createRingApi(email, password, twoFactorCode?)` — handles 2FA prompt loop
- Subscribes to `onRefreshTokenUpdated` to print the usable token

---

## What this tool cannot do

| Capability | Reason / alternative |
|------------|---------------------|
| Live stream recording | WebRTC-based; use `camera.recordToFile()` separately |
| Continuous/periodic recordings | Separate API path (`getPeriodicalFootage`); not implemented in v1 |
| Shared location / sub-accounts | Only works with the account that owns the token |
| Video playback | Use VLC or any MP4-compatible player on downloaded files |
| Push notifications | No server process; run via cron for automation |
| Re-encoding / transcoding locally | No ffmpeg dependency; use ffmpeg separately on downloaded files |
| Downloading snapshots (JPEG) | Only video recordings; use `camera.getSnapshot()` separately |

---

## Ring API methods used

| Method | Used for |
|--------|----------|
| `api.getCameras()` | List all cameras |
| `camera.videoSearch({ dateFrom, dateTo })` | Date-filtered event list (primary path) |
| `camera.getEvents({ limit, olderThanId })` | Paginated event list (fallback path) |
| `camera.getRecordingUrl(dingIdStr, { transcoded })` | Signed download URL when `hq_url` not present |
| `api.onRefreshTokenUpdated` | Capture and print new refresh token after auth |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RING_REFRESH_TOKEN` | Yes (for `cameras` and `download`) | Long-lived Ring auth token |
