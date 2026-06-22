import { handleProspectPulseRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('login', request, process.env)
  },
}
