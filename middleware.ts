import {
  ACCESS_COOKIE_NAME,
  accessConfigMessage,
  accessGateReady,
  readCookie,
  safeNextPath,
  verifyAccessSession,
} from './server/access'

const PUBLIC_PATHS = new Set(['/access.html', '/backstop-logo.jpeg', '/favicon.svg'])
const PUBLIC_PREFIXES = ['/api/access-login', '/api/access-logout']

export const config = {
  matcher: ['/((?!_vercel/insights|_vercel/speed-insights).*)'],
}

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function redirectToLogin(request: Request) {
  const url = new URL(request.url)
  const loginUrl = new URL('/access.html', request.url)
  const next = `${url.pathname}${url.search}`
  if (next !== '/') loginUrl.searchParams.set('next', safeNextPath(next))

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${loginUrl.pathname}${loginUrl.search}`,
      'Cache-Control': 'no-store',
    },
  })
}

export default async function middleware(request: Request) {
  const url = new URL(request.url)

  if (!accessGateReady(process.env)) {
    if (isPublicPath(url.pathname)) return
    return new Response(accessConfigMessage(process.env), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const session = readCookie(request.headers.get('cookie'), ACCESS_COOKIE_NAME)
  const validSession = await verifyAccessSession(session, process.env)

  if (isPublicPath(url.pathname)) {
    if (url.pathname === '/access.html' && validSession) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: safeNextPath(url.searchParams.get('next')),
          'Cache-Control': 'no-store',
        },
      })
    }
    return
  }

  if (validSession) return
  return redirectToLogin(request)
}
