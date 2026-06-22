/// <reference types="node" />

import { handleProspectPulseRoute } from '../../server/proxy.js'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('api-checklists', request, process.env)
  },
}
