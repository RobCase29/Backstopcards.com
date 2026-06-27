/// <reference types="node" />

import { handleProspectPulseRoute } from '../../server/proxy.js'

function routeFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute(routeFromRequest(request), request, process.env)
  },
}
