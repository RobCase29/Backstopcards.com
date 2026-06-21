import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_SUPABASE_URL = 'https://rhlontbdiezpefgbbkql.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobG9udGJkaWV6cGVmZ2Jia3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzIwNjcsImV4cCI6MjA4MTIwODA2N30.H12G7ZC2yUzpXZ0sCrqvhdlIiniGGP6uUgrmEqdOkpk'

async function readRequestBody(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) body += chunk
  return body
}

function canUsePublicChecklist(body: string) {
  try {
    const payload = JSON.parse(body) as { action?: string }
    return payload.action === 'getCategoryOverview' || payload.action === 'getCategoryYearMultipliers'
  } catch {
    return false
  }
}

function prospectPulseProxy(): Plugin {
  return {
    name: 'prospect-pulse-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const supabaseUrl = env.PROSPECTPULSE_SUPABASE_URL || DEFAULT_SUPABASE_URL
      const envAccessToken = env.PROSPECTPULSE_ACCESS_TOKEN
      const anonKey = env.PROSPECTPULSE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

      server.middlewares.use('/api/prospectpulse', async (request, response) => {
        const route = (request.url ?? '').replace(/^\/+/, '').split('?')[0]

        if (request.method === 'GET' && route === 'status') {
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              connected: Boolean(envAccessToken),
              hasAnonKey: Boolean(anonKey),
              message: envAccessToken ? 'ProspectPulse token loaded' : 'No server access token configured',
            }),
          )
          return
        }

        if (request.method === 'POST' && route === 'login') {
          try {
            const payload = JSON.parse(await readRequestBody(request)) as {
              email?: string
              password?: string
            }
            if (!payload.email || !payload.password) {
              response.statusCode = 400
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: 'Email and password are required' }))
              return
            }

            const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
              },
              body: JSON.stringify({
                email: payload.email,
                password: payload.password,
              }),
            })
            const text = await upstream.text()
            response.statusCode = upstream.status
            response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
            response.end(text)
          } catch (error) {
            response.statusCode = 400
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Login request failed',
              }),
            )
          }
          return
        }

        if (!route || request.method !== 'POST') {
          response.statusCode = 404
          response.end()
          return
        }

        const body = await readRequestBody(request)
        const headerToken = request.headers['x-prospectpulse-access-token']
        const accessToken =
          envAccessToken ||
          (Array.isArray(headerToken) ? headerToken[0] : headerToken) ||
          (route === 'api-checklists' && canUsePublicChecklist(body) ? anonKey : undefined)

        if (!accessToken) {
          response.statusCode = 401
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Connect ProspectPulse or set PROSPECTPULSE_ACCESS_TOKEN in .env.local' }))
          return
        }

        try {
          const upstream = await fetch(`${supabaseUrl}/functions/v1/${route}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              ...(anonKey ? { apikey: anonKey } : {}),
            },
            body,
          })
          const text = await upstream.text()
          response.statusCode = upstream.status
          response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
          response.end(text)
        } catch (error) {
          response.statusCode = 502
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'ProspectPulse proxy request failed',
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prospectPulseProxy()],
})
