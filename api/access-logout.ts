import { expiredAccessCookie } from '../server/access.js'

export default {
  fetch() {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/access.html',
        'Set-Cookie': expiredAccessCookie(),
        'Cache-Control': 'no-store',
      },
    })
  },
}
