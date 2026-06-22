import { handleProspectPulseRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('api-listings', request, process.env)
  },
}
