/// <reference types="node" />

import { handleProspectPulseRoute } from '../../server/proxy.js'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('login', request, process.env)
  },
}
