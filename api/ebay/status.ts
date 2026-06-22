/// <reference types="node" />

import { handleEbayRoute } from '../../server/proxy.js'

export default {
  fetch(request: Request) {
    return handleEbayRoute('status', request, process.env)
  },
}
