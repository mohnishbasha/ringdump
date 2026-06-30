# ringdump

Bulk download and archive Ring security camera footage to local storage. Filter by camera, date range, and event type — motion, doorbell, or person detection. Built on [`ring-client-api`](https://github.com/dgreif/ring).

## Features

- Download videos from any Ring camera by date range
- Filter by camera name or ID (partial match)
- Filter by event type: `motion`, `ding`, or `all`
- Skip already-downloaded files automatically
- Parallel downloads per camera (configurable)
- Outputs per-camera subdirectories with timestamped filenames

## Requirements

- Node.js >= 18
- A Ring account with an active subscription

---

## Quick Start

```bash
# 1. Clone and build
git clone https://github.com/mohnishbasha/ringdump.git
cd ringdump
make build

# 2. Get your Ring refresh token
node dist/index.js auth -e your@email.com -p yourpassword

# 3. Export the token printed above
export RING_REFRESH_TOKEN="your_token_here"

# 4. See your cameras
make cameras

# 5. Download everything
make download-all

# Or download a specific date range
make download FROM=2024-06-01 TO=2024-06-30
```

---

## Installation

```bash
git clone https://github.com/mohnishbasha/ringdump.git
cd ringdump
npm install
npm run build
```

---

## Authentication

Ring requires a refresh token for API access. Get one with either method:

```bash
# Option A — built-in auth command (prompts for 2FA if needed)
node dist/index.js auth -e your@email.com -p yourpassword

# Option B — ring-client-api helper (interactive)
npx -p ring-client-api ring-auth
```

Both print a refresh token. Set it as an environment variable:

```bash
export RING_REFRESH_TOKEN="your_token_here"
```

Or save it to a `.env` file (not committed to git):

```
RING_REFRESH_TOKEN=your_token_here
```

> The token is long-lived but rotates automatically. If you get auth errors, re-run the auth command and update the variable.

---

## Running

After building (`npm run build`), all commands follow this pattern:

```
node dist/index.js <command> [options]
```

### List cameras

```bash
node dist/index.js cameras
```

```
Ring Cameras (3):
  [123456] Front Door — doorbell_v4
  [234567] Backyard   — hp_cam_v2
  [345678] Garage     — stickup_cam_v4
```

### Download videos

```bash
# All cameras, full month
node dist/index.js download --from 2024-06-01 --to 2024-06-30

# Specific camera, specific day and time window
node dist/index.js download \
  --from "2024-06-15 08:00" \
  --to "2024-06-15 20:00" \
  --camera "Front Door"

# Motion events only, save to a custom folder
node dist/index.js download \
  --from 2024-06-01 --to 2024-06-30 \
  --kind motion \
  --output ~/Desktop/ring-clips

# Cap at 50 events, include Ring watermark/timestamp overlay
node dist/index.js download \
  --from 2024-06-01 --to 2024-06-07 \
  --limit 50 \
  --transcoded
```

### Get help for any command

```bash
node dist/index.js --help
node dist/index.js download --help
```

---

## Options reference

### `download`

| Flag | Description | Default |
|------|-------------|---------|
| `--from <datetime>` | Start date/time — `YYYY-MM-DD`, `YYYY-MM-DD HH:MM`, or ISO 8601 | required |
| `--to <datetime>` | End date/time (same formats) | required |
| `-c, --camera <name>` | Camera name or ID substring match | all cameras |
| `-k, --kind <type>` | `motion` \| `ding` \| `all` | `all` |
| `-o, --output <dir>` | Output directory | `./ring-videos` |
| `-l, --limit <n>` | Max events per camera | unlimited |
| `--transcoded` | Download with Ring watermark/timestamp burned in | false (raw) |
| `--concurrency <n>` | Parallel downloads per camera | 3 |

### `auth`

| Flag | Description |
|------|-------------|
| `-e, --email <email>` | Ring account email |
| `-p, --password <password>` | Ring account password |
| `--2fa <code>` | 2FA code (if your account requires it) |

---

## Output structure

Files are saved as `YYYYMMDD_HHMMSS_<kind>_<dingId>.mp4` inside a per-camera subdirectory:

```
ring-videos/
  Front_Door/
    20240615_081232_motion_7890123456789012345.mp4
    20240615_091045_ding_7890123456789012346.mp4
  Backyard/
    20240615_143301_motion_7890123456789012347.mp4
```

Re-running the same command skips any file that already exists and is non-empty.

---

## Development

```bash
make install    # install npm dependencies
make build      # compile TypeScript → dist/
make rebuild    # clean + install + build from scratch
make clean      # remove dist/
make check      # type-check without emitting files
```

Run without a build step using `ts-node`:

```bash
make dev ARGS="cameras"
make dev ARGS="download --from 2024-06-01 --to 2024-06-02 --limit 5"
```

Run `make` or `make help` to see all available targets.

---

## License

MIT
