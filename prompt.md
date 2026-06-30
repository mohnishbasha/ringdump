# Prompts — ring-backup

This file records the prompts used to build this project via Claude Code.
Useful for reproducing, extending, or debugging AI-assisted development.

---

## Initial build prompt

> use library https://github.com/dgreif/ring.git reference example
> https://github.com/dgreif/ring-client-example or
> https://github.com/dgreif/ring/tree/main/packages/examples ...
> to be able to download all ring videos. write an application that can
> help download videos from ring based on date time and camera

**What Claude did:**
1. Spawned an Explore agent to read the Ring library source and identify the relevant API methods (`videoSearch`, `getEvents`, `getRecordingUrl`, `getCameras`)
2. Built a 3-file TypeScript CLI (`index.ts`, `downloader.ts`, `auth.ts`)
3. Installed `ring-client-api`, `commander`, `chalk`, `cli-progress`
4. Compiled with `tsc` — zero errors

---

## Documentation prompt

> add a readme, claude.md, product spec to capture prd, .gitignore, prompt.md, skills.md

**What Claude did:**
- Created `README.md` with setup, usage, and output structure docs
- Created `CLAUDE.md` with project conventions for future Claude Code sessions
- Created `PRD.md` with problem statement, functional requirements, and technical decisions
- Updated `.gitignore` with additional patterns
- Created this `prompt.md` file
- Created `skills.md` with capability inventory

---

## Prompt patterns that worked well

### Research before building
Spawning an Explore agent to read the upstream library source before writing any code
avoided guessing at API shapes. The agent identified `videoSearch()` as the right
method for date filtering — not obvious from the README alone.

### Fallback strategy
Asking "what if `videoSearch` isn't available?" led to the paginated `getEvents`
fallback in `fetchAllEvents()`. Ring's API surface varies by account type and
firmware; having two paths makes the tool more robust.

---

## Prompts to extend this project

### Add cron/scheduled backup
> Add a `--since-last-run` flag that reads a `.ring-backup-state.json` file,
> sets `--from` to the last successful run timestamp, and updates the file
> after a successful run. This enables cron-based incremental backups.

### Add progress bars
> Replace the per-file console.log lines in `downloader.ts` with a `cli-progress`
> MultiBar that shows one bar per camera with bytes downloaded / total.

### Add a config file
> Add support for a `.ring-backup.json` config file in the project root that
> can set defaults for `output`, `concurrency`, `kind`, and `transcoded`.
> CLI flags should override config file values.

### Add parallel camera processing
> In `downloadVideos()`, process cameras in parallel instead of sequentially.
> Add a `--camera-concurrency` flag (default 1) to control how many cameras
> are processed at once.

### Test harness
> Write integration tests using a mock `RingApi` that returns fixture data.
> Cover: date parsing edge cases, pagination fallback, skip-if-exists logic,
> camera name sanitization.
