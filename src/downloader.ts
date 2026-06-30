import { RingApi, RingCamera } from 'ring-client-api'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { SingleBar, Presets } from 'cli-progress'
import chalk from 'chalk'

export interface DownloadOptions {
  fromDate: Date
  toDate: Date
  cameraFilter?: string   // name or ID substring match
  outputDir: string
  limit?: number           // max events per camera (default: unlimited via pagination)
  kind?: 'motion' | 'ding' | 'all'
  personOnly?: boolean     // restrict to person_detected state events
  transcoded?: boolean     // include Ring watermark/timestamp overlay
  concurrency?: number     // parallel downloads
}

export interface DownloadResult {
  camera: string
  file: string
  eventTime: Date
  kind: string
  skipped: boolean
  reason?: string
}

function resolveUrl(urlString: string): Promise<string> {
  return new Promise((resolve) => {
    const mod = urlString.startsWith('https') ? https : http
    mod.get(urlString, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(res.headers.location)
      } else {
        resolve(urlString)
      }
      res.destroy()
    }).on('error', () => resolve(urlString))
  })
}

function downloadFile(url: string, destPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    let receivedBytes = 0

    const doRequest = (reqUrl: string) => {
      const mod = reqUrl.startsWith('https') ? https : http
      mod.get(reqUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(destPath, () => {})
          reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`))
          return
        }
        res.on('data', (chunk: Buffer) => { receivedBytes += chunk.length })
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(receivedBytes)
        })
      }).on('error', (err) => {
        file.close()
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    doRequest(url)
  })
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_')
}

function formatTimestamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

async function fetchPersonEvents(
  camera: RingCamera,
  fromDate: Date,
  toDate: Date,
  limit?: number
) {
  const fromMs = fromDate.getTime()
  const toMs = toDate.getTime()
  const allEvents: any[] = []
  let paginationKey: string | undefined

  outer: while (true) {
    const resp = await camera.getEvents({
      limit: 100,
      state: 'person_detected' as any,
      ...(paginationKey ? { olderThanId: paginationKey } : {}),
    })

    const events = resp.events ?? []
    if (events.length === 0) break

    for (const ev of events) {
      const evMs = new Date(ev.created_at).getTime()
      if (evMs < fromMs) break outer
      if (evMs <= toMs) {
        allEvents.push({ ...ev, _label: 'person' })
        if (limit && allEvents.length >= limit) break outer
      }
    }

    paginationKey = resp.meta?.pagination_key
    if (!paginationKey) break
  }

  return allEvents
}

async function fetchAllEvents(
  camera: RingCamera,
  fromDate: Date,
  toDate: Date,
  kind: 'motion' | 'ding' | 'all',
  limit?: number
) {
  const fromMs = fromDate.getTime()
  const toMs = toDate.getTime()

  // videoSearch gives us direct date filtering
  try {
    const result = await camera.videoSearch({
      dateFrom: fromMs,
      dateTo: toMs,
      order: 'desc',
    })
    const videos = result.video_search ?? []
    const filtered = kind === 'all'
      ? videos
      : videos.filter((v) => v.kind === kind)
    return limit ? filtered.slice(0, limit) : filtered
  } catch {
    // Fallback: paginate getEvents and filter by timestamp manually
    const allEvents: any[] = []
    let paginationKey: string | undefined

    outer: while (true) {
      const resp = await camera.getEvents({
        limit: 100,
        ...(paginationKey ? { olderThanId: paginationKey } : {}),
      })

      const events = resp.events ?? []
      if (events.length === 0) break

      for (const ev of events) {
        const evMs = new Date(ev.created_at).getTime()
        if (evMs < fromMs) break outer
        if (evMs <= toMs) {
          if (kind === 'all' || ev.kind === kind) {
            allEvents.push(ev)
          }
          if (limit && allEvents.length >= limit) break outer
        }
      }

      paginationKey = resp.meta?.pagination_key
      if (!paginationKey) break
    }

    return allEvents
  }
}

export async function downloadVideos(
  api: RingApi,
  opts: DownloadOptions
): Promise<DownloadResult[]> {
  const {
    fromDate,
    toDate,
    cameraFilter,
    outputDir,
    limit,
    kind = 'all',
    personOnly = false,
    transcoded = false,
    concurrency = 3,
  } = opts

  const allCameras = await api.getCameras()
  let cameras: RingCamera[]

  if (cameraFilter) {
    const f = cameraFilter.toLowerCase()
    cameras = allCameras.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        String(c.id).includes(f)
    )
    if (cameras.length === 0) {
      console.log(chalk.yellow(`No cameras matched "${cameraFilter}"`))
      console.log(chalk.dim('Available cameras:'))
      allCameras.forEach((c) => console.log(chalk.dim(`  [${c.id}] ${c.name}`)))
      return []
    }
  } else {
    cameras = allCameras
  }

  console.log(chalk.cyan(`\nFound ${cameras.length} camera(s) to process`))

  const results: DownloadResult[] = []

  for (const camera of cameras) {
    const cameraDir = path.join(outputDir, sanitize(camera.name))
    fs.mkdirSync(cameraDir, { recursive: true })

    console.log(chalk.bold(`\n→ ${camera.name} [ID: ${camera.id}]`))
    console.log(chalk.dim(`  Fetching events ${fromDate.toISOString()} → ${toDate.toISOString()}...`))

    let events: any[]
    try {
      events = personOnly
        ? await fetchPersonEvents(camera, fromDate, toDate, limit)
        : await fetchAllEvents(camera, fromDate, toDate, kind, limit)
    } catch (err: any) {
      console.log(chalk.red(`  Error fetching events: ${err.message}`))
      continue
    }

    if (events.length === 0) {
      console.log(chalk.dim('  No events found in this date range'))
      continue
    }

    console.log(chalk.green(`  Found ${events.length} event(s)`))

    // Process in batches of `concurrency`
    for (let i = 0; i < events.length; i += concurrency) {
      const batch = events.slice(i, i + concurrency)
      await Promise.all(
        batch.map(async (ev) => {
          const eventTime = new Date(ev.created_at)
          const dingId: string = ev.ding_id_str ?? String(ev.ding_id)
          const evKind: string = ev._label ?? ev.kind ?? 'event'
          const filename = `${formatTimestamp(eventTime)}_${evKind}_${dingId}.mp4`
          const destPath = path.join(cameraDir, filename)

          if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            results.push({ camera: camera.name, file: destPath, eventTime, kind: evKind, skipped: true, reason: 'already exists' })
            console.log(chalk.dim(`  ↷ ${filename} (already exists)`))
            return
          }

          let url: string | null = null
          try {
            // Prefer hq_url from videoSearch; fall back to getRecordingUrl
            if (ev.hq_url) {
              url = transcoded ? ev.hq_url : (ev.untranscoded_url ?? ev.hq_url)
            } else {
              url = await camera.getRecordingUrl(dingId, { transcoded })
            }
          } catch (err: any) {
            results.push({ camera: camera.name, file: destPath, eventTime, kind: evKind, skipped: true, reason: err.message })
            console.log(chalk.yellow(`  ✗ ${filename} — ${err.message}`))
            return
          }

          if (!url) {
            results.push({ camera: camera.name, file: destPath, eventTime, kind: evKind, skipped: true, reason: 'no URL available' })
            console.log(chalk.yellow(`  ✗ ${filename} — no URL`))
            return
          }

          try {
            const bytes = await downloadFile(url, destPath)
            const kb = (bytes / 1024).toFixed(1)
            results.push({ camera: camera.name, file: destPath, eventTime, kind: evKind, skipped: false })
            console.log(chalk.green(`  ✓ ${filename} (${kb} KB)`))
          } catch (err: any) {
            results.push({ camera: camera.name, file: destPath, eventTime, kind: evKind, skipped: true, reason: err.message })
            console.log(chalk.red(`  ✗ ${filename} — ${err.message}`))
          }
        })
      )
    }
  }

  return results
}

export async function listCameras(api: RingApi): Promise<void> {
  const cameras = await api.getCameras()
  if (cameras.length === 0) {
    console.log(chalk.yellow('No cameras found on this account'))
    return
  }
  console.log(chalk.bold(`\nRing Cameras (${cameras.length}):`))
  cameras.forEach((c) => {
    console.log(`  ${chalk.cyan(`[${c.id}]`)} ${chalk.bold(c.name)} — ${chalk.dim(c.deviceType)}`)
  })
}
