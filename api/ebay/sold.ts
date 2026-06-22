import { handleEbayRoute } from '../../server/proxy'

export default {
  fetch(request: Request) {
    return handleEbayRoute('sold', request, process.env)
  },
}
