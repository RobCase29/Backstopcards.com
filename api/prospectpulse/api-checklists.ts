import { handleProspectPulseRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleProspectPulseRoute('api-checklists', request, process.env)
  },
}
