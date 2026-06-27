import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  handleCardHedgeNodeRequest,
  handleChecklistNodeRequest,
  handleEbayNodeRequest,
  handleLiveMarketNodeRequest,
  handleProspectPulseNodeRequest,
  handleRankingsNodeRequest,
  handleSalesCacheNodeRequest,
} from './server/proxy'

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

function cardHedgeProxy(): Plugin {
  return {
    name: 'card-hedge-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/card-hedge', async (request, response) => {
        await handleCardHedgeNodeRequest(request, response, env)
      })
    },
  }
}

function salesCacheProxy(): Plugin {
  return {
    name: 'sales-cache-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/sales-cache', async (request, response) => {
        await handleSalesCacheNodeRequest(request, response, env)
      })
    },
  }
}

function checklistProxy(): Plugin {
  return {
    name: 'checklist-ledger-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/checklist', async (request, response) => {
        await handleChecklistNodeRequest(request, response, env)
      })
    },
  }
}

function liveMarketProxy(): Plugin {
  return {
    name: 'live-market-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/live-market', async (request, response) => {
        await handleLiveMarketNodeRequest(request, response, env)
      })
    },
  }
}

function rankingsProxy(): Plugin {
  return {
    name: 'rankings-local-proxy',
    configureServer(server) {
      server.middlewares.use('/api/rankings', async (request, response) => {
        await handleRankingsNodeRequest(request, response)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    prospectPulseProxy(),
    ebayProxy(),
    cardHedgeProxy(),
    salesCacheProxy(),
    checklistProxy(),
    liveMarketProxy(),
    rankingsProxy(),
  ],
})
