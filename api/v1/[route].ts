/// <reference types="node" />

import { handlePlayerModelsApiRoute } from '../../server/playerModelsApi.js'

function routeFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  return segments.at(-1) ?? ''
}

export default {
  fetch(request: Request) {
    return handlePlayerModelsApiRoute(routeFromRequest(request), request, process.env)
  },
}
