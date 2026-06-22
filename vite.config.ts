import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleEbayNodeRequest, handleProspectPulseNodeRequest } from './server/proxy'

function prospectPulseProxy(): Plugin {
  return {
    name: 'prospect-pulse-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/prospectpulse', async (request, response) => {
        await handleProspectPulseNodeRequest(request, response, env)
      })
    },
  }
}

function ebayProxy(): Plugin {
  return {
    name: 'ebay-browse-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/ebay', async (request, response) => {
        await handleEbayNodeRequest(request, response, env)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prospectPulseProxy(), ebayProxy()],
})
