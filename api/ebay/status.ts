import { handleEbayRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleEbayRoute('status', request, process.env)
  },
}
