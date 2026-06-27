import { existsSync, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const API_BASE = 'https://api.cardhedger.com'

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

async function loadEnvFile(file) {
  if (!existsSync(file)) return
  const text = await readFile(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    const value = rawValue.replace(/^['"]|['"]$/g, '')
    process.env[key] = value
  }
}

function argValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  return null
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function yesterdayUtc() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function requestedDate() {
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
  const date = argValue('--date') || positional || yesterdayUtc()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Card Hedge export date must be YYYY-MM-DD')
  }
  return date
}

function extensionForContentType(contentType) {
  return /json/i.test(contentType) ? 'json' : 'csv'
}

function outputPath(date, extension) {
  const explicit = argValue('--out')
  if (explicit) return resolve(repoRoot(), explicit)
  return resolve(repoRoot(), 'local-data/card-hedge/daily', `card-hedge-prices-${date}.${extension}`)
}

function byteCounter(onBytes) {
  return new Transform({
    transform(chunk, _encoding, callback) {
      onBytes(chunk.length)
      callback(null, chunk)
    },
  })
}

async function main() {
  const root = repoRoot()
  await loadEnvFile(resolve(root, '.env.local'))

  const apiKey = process.env.CARD_HEDGE_API_KEY
  if (!apiKey) throw new Error('Set CARD_HEDGE_API_KEY in .env.local or your shell environment')

  const date = requestedDate()
  const endpoint = `/v1/download/daily-price-export/${date}`
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'text/csv, application/json',
      'User-Agent': 'Backstop Card Finder Card Hedge daily export',
    },
  })

  const contentType = response.headers.get('Content-Type') ?? 'text/csv'
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Card Hedge daily export failed: ${response.status} ${response.statusText} ${text.slice(0, 400)}`)
  }
  if (!response.body) throw new Error('Card Hedge daily export returned an empty response body')

  const target = outputPath(date, extensionForContentType(contentType))
  if (existsSync(target) && !hasFlag('--force')) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'target exists; pass --force to replace it',
          date,
          target,
        },
        null,
        2,
      ),
    )
    return
  }

  await mkdir(dirname(target), { recursive: true })
  const tmpFile = `${target}.tmp-${process.pid}`
  let bytes = 0

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      byteCounter((chunkBytes) => {
        bytes += chunkBytes
      }),
      createWriteStream(tmpFile),
    )
    await rename(tmpFile, target)
  } catch (error) {
    await rm(tmpFile, { force: true })
    throw error
  }

  const downloadedAt = new Date().toISOString()
  const meta = {
    date,
    target,
    bytes,
    contentType,
    downloadedAt,
    source: 'card-hedge-daily-price-export',
    endpoint,
  }
  await writeFile(`${target}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(meta, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
