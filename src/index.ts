#!/usr/bin/env node
import { Command } from 'commander'
import { RingApi } from 'ring-client-api'
import chalk from 'chalk'
import * as path from 'path'
import * as fs from 'fs'
import { downloadVideos, listCameras } from './downloader'

const program = new Command()

program
  .name('ring-backup')
  .description('Download Ring camera videos by date/time and camera')
  .version('1.0.0')

function getApi(): RingApi {
  const token = process.env.RING_REFRESH_TOKEN
  if (!token) {
    console.error(chalk.red('Error: RING_REFRESH_TOKEN environment variable is required'))
    console.error(chalk.dim('Run `ring-auth` or set the token manually in your environment'))
    process.exit(1)
  }
  return new RingApi({ refreshToken: token })
}

// ─── list cameras ────────────────────────────────────────────────────────────

program
  .command('cameras')
  .description('List all Ring cameras on your account')
  .action(async () => {
    const api = getApi()
    try {
      await listCameras(api)
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
    process.exit(0)
  })

// ─── authenticate ─────────────────────────────────────────────────────────────

program
  .command('auth')
  .description('Validate a refresh token and confirm it works')
  .requiredOption('-t, --token <token>', 'Ring refresh token to validate')
  .action(async (opts) => {
    try {
      const { printRefreshToken } = await import('./auth')
      await printRefreshToken(opts.token)
      console.log(chalk.green('\nToken is valid.'))
    } catch (err: any) {
      console.error(chalk.red(`Auth error: ${err.message}`))
      process.exit(1)
    }
    process.exit(0)
  })

// ─── download ────────────────────────────────────────────────────────────────

program
  .command('download')
  .description('Download videos from Ring cameras')
  .option('-c, --camera <name>', 'Camera name or ID (partial match). Omit to download from all cameras.')
  .requiredOption('--from <datetime>', 'Start date/time (ISO 8601 or "YYYY-MM-DD" or "YYYY-MM-DD HH:MM")')
  .requiredOption('--to <datetime>', 'End date/time (ISO 8601 or "YYYY-MM-DD" or "YYYY-MM-DD HH:MM")')
  .option('-o, --output <dir>', 'Output directory', './ring-videos')
  .option('-k, --kind <type>', 'Event type: motion | ding | all', 'all')
  .option('--person', 'Download person-detected events only', false)
  .option('-l, --limit <n>', 'Max events per camera (default: unlimited)', parseInt)
  .option('--transcoded', 'Download transcoded video (with Ring overlay)', false)
  .option('--concurrency <n>', 'Parallel downloads per camera', parseInt, 3)
  .action(async (opts) => {
    const fromDate = parseDate(opts.from)
    const toDate = parseDate(opts.to)

    if (!fromDate) {
      console.error(chalk.red(`Invalid --from date: "${opts.from}"`))
      console.error(chalk.dim('Examples: 2024-01-15  |  "2024-01-15 14:30"  |  2024-01-15T14:30:00'))
      process.exit(1)
    }
    if (!toDate) {
      console.error(chalk.red(`Invalid --to date: "${opts.to}"`))
      process.exit(1)
    }
    if (fromDate >= toDate) {
      console.error(chalk.red('--from must be before --to'))
      process.exit(1)
    }

    const validKinds = ['motion', 'ding', 'all']
    if (!validKinds.includes(opts.kind)) {
      console.error(chalk.red(`--kind must be one of: ${validKinds.join(', ')}`))
      process.exit(1)
    }

    const outputDir = path.resolve(opts.output)
    fs.mkdirSync(outputDir, { recursive: true })

    console.log(chalk.bold('\nRing Backup'))
    console.log(chalk.dim('─'.repeat(40)))
    console.log(`  From:        ${chalk.cyan(fromDate.toISOString())}`)
    console.log(`  To:          ${chalk.cyan(toDate.toISOString())}`)
    if (opts.camera) console.log(`  Camera:      ${chalk.cyan(opts.camera)}`)
    console.log(`  Kind:        ${chalk.cyan(opts.person ? 'person (detected)' : opts.kind)}`)
    console.log(`  Output:      ${chalk.cyan(outputDir)}`)
    console.log(`  Transcoded:  ${chalk.cyan(opts.transcoded)}`)
    console.log(`  Concurrency: ${chalk.cyan(opts.concurrency ?? 3)}`)
    if (opts.limit) console.log(`  Limit:       ${chalk.cyan(opts.limit)} per camera`)
    console.log(chalk.dim('─'.repeat(40)))

    const api = getApi()

    try {
      const results = await downloadVideos(api, {
        fromDate,
        toDate,
        cameraFilter: opts.camera,
        outputDir,
        limit: opts.limit,
        kind: opts.kind as 'motion' | 'ding' | 'all',
        personOnly: opts.person,
        transcoded: opts.transcoded,
        concurrency: opts.concurrency ?? 3,
      })

      const downloaded = results.filter((r) => !r.skipped)
      const skipped = results.filter((r) => r.skipped && r.reason === 'already exists')
      const failed = results.filter((r) => r.skipped && r.reason !== 'already exists')

      console.log(chalk.dim('\n─'.repeat(40)))
      console.log(chalk.bold('Summary:'))
      console.log(`  ${chalk.green('✓')} Downloaded: ${downloaded.length}`)
      if (skipped.length) console.log(`  ${chalk.dim('↷')} Already existed: ${skipped.length}`)
      if (failed.length) console.log(`  ${chalk.red('✗')} Failed: ${failed.length}`)
      console.log()
    } catch (err: any) {
      console.error(chalk.red(`\nError: ${err.message}`))
      process.exit(1)
    }

    process.exit(0)
  })

function parseDate(input: string): Date | null {
  // Handle "YYYY-MM-DD" → treat as local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = new Date(input + 'T00:00:00')
    return isNaN(d.getTime()) ? null : d
  }
  // Handle "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(input)) {
    const d = new Date(input.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d
  }
  // ISO 8601 and anything else JS can parse
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

program.parse(process.argv)
