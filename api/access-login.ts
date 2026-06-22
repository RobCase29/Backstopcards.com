/// <reference types="node" />

import {
  accessCodeMatches,
  accessConfigMessage,
  accessCookie,
  accessGateReady,
  createAccessSession,
  safeNextPath,
} from '../server/access.js'

async function readLoginBody(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await request.json().catch(() => ({}))) as { code?: unknown; next?: unknown }
    return {
      code: typeof payload.code === 'string' ? payload.code : '',
      next: typeof payload.next === 'string' ? payload.next : '',
    }
  }

  const params = new URLSearchParams(await request.text())
  return {
    code: params.get('code') ?? '',
    next: params.get('next') ?? '',
  }
}

function redirectToAccess(next: string, error = false) {
  const url = new URL('/access.html', 'https://backstop.local')
  if (error) url.searchParams.set('error', '1')
  if (next && next !== '/') url.searchParams.set('next', next)
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${url.pathname}${url.search}`,
      'Cache-Control': 'no-store',
    },
  })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    const body = await readLoginBody(request)
    const next = safeNextPath(body.next)

    if (!accessGateReady(process.env)) {
      return new Response(accessConfigMessage(process.env), {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    if (!accessCodeMatches(body.code.trim(), process.env)) return redirectToAccess(next, true)

    const session = await createAccessSession(process.env)
    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        'Set-Cookie': accessCookie(session),
        'Cache-Control': 'no-store',
      },
    })
  },
}
