import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  handleCardHedgeNodeRequest,
  handleChecklistNodeRequest,
  handleDaveAdamsNodeRequest,
  handleEbayNodeRequest,
  handleFanaticsCollectNodeRequest,
  handleLiveMarketNodeRequest,
  handleProspectPulseNodeRequest,
  handleRankingsNodeRequest,
  handleSalesCacheNodeRequest,
  handleScanCoverageNodeRequest,
  handleScanQueueNodeRequest,
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

function fanaticsCollectProxy(): Plugin {
  return {
    name: 'fanatics-collect-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/fanatics-collect')) {
          next()
          return
        }
        await handleFanaticsCollectNodeRequest(request, response, env)
      })
    },
  }
}

function daveAdamsProxy(): Plugin {
  return {
    name: 'dave-adams-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/dave-adams')) {
          next()
          return
        }
        await handleDaveAdamsNodeRequest(request, response, env)
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

function scanCoverageProxy(): Plugin {
  return {
    name: 'scan-coverage-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/scan-coverage', async (request, response) => {
        await handleScanCoverageNodeRequest(request, response, env)
      })
    },
  }
}

function scanQueueProxy(): Plugin {
  return {
    name: 'scan-queue-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')

      server.middlewares.use('/api/scan-queue', async (request, response) => {
        await handleScanQueueNodeRequest(request, response, env)
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
    fanaticsCollectProxy(),
    daveAdamsProxy(),
    cardHedgeProxy(),
    salesCacheProxy(),
    checklistProxy(),
    liveMarketProxy(),
    scanCoverageProxy(),
    scanQueueProxy(),
    rankingsProxy(),
  ],
})
