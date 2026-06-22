/// <reference types="node" />

import { handleProspectPulseRoute } from '../../server/proxy.js'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('status', request, process.env)
  },
}
