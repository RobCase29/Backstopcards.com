import { handleProspectPulseRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('status', request, process.env)
  },
}
