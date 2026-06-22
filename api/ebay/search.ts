import { handleEbayRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleEbayRoute('search', request, process.env)
  },
}
