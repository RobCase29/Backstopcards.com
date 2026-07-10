import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function argument(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length)
  return value || fallback
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

const origin = argument('origin', 'https://backstopcards.com').replace(/\/$/, '')
const batches = boundedInteger(argument('batches', '1'), 1, 1, 45)
const delayMs = boundedInteger(argument('delay-ms', '25000'), 25_000, 0, 120_000)
const codeFile = resolve(argument('code-file', '.vercel-access-code.txt'))
const accessCode = (await readFile(codeFile, 'utf8')).trim()

if (!accessCode) throw new Error(`Private app access code is empty: ${codeFile}`)

const login = await fetch(`${origin}/api/access/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code: accessCode, next: '/' }),
  redirect: 'manual',
})
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
if (!cookie) throw new Error(`Private app login failed (${login.status})`)

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

for (let index = 1; index <= batches; index += 1) {
  const startedAt = Date.now()
  const response = await fetch(`${origin}/api/card-hedge/refresh`, {
    method: 'POST',
    headers: {
      cookie,
      origin,
      referer: `${origin}/`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(119_000),
  })
  const payload = await response.json().catch(() => ({}))
  const queue = Object.fromEntries((payload.hosted?.queue ?? []).map((row) => [row.status, row.players]))
  console.log(
    JSON.stringify({
      batch: index,
      status: response.status,
      durationSeconds: Math.round((Date.now() - startedAt) / 1_000),
      exportDate: payload.dailyExportDate ?? '',
      exportMatchedPlayers: payload.dailyExportMatchedPlayers ?? 0,
      completedPlayers: payload.completedPlayers ?? 0,
      matchedPlayers: payload.matchedPlayers ?? 0,
      noMatchPlayers: payload.missingPlayers ?? 0,
      failedPlayers: payload.failedPlayers ?? 0,
      apiCalls: payload.apiCalls ?? 0,
      done: queue.done ?? 0,
      queued: queue.queued ?? 0,
      noMatch: queue['no-match'] ?? 0,
      errors: queue.error ?? 0,
    }),
  )
  if (!response.ok) throw new Error(payload.error || `Hosted comp refresh failed (${response.status})`)
  if (index < batches && delayMs > 0) await sleep(delayMs)
}
