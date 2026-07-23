// index.mjs
import { startServer } from '@microsoft/agents-hosting-express'
import { MemoryStorage } from '@microsoft/agents-hosting'
import http from 'http'
import { EchoAgent } from './EchoAgent.mjs'



// Try to attach a /health endpoint to the server or app returned by startServer.
// If attaching isn't possible, start a small fallback health server on `process.env.HEALTH_PORT || 3000`.
const started = startServer(new EchoAgent(new MemoryStorage()))

function startFallbackHealthServer () {
  const port = process.env.HEALTH_PORT || 3000
  const srv = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('OK')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  srv.listen(port, () => console.log(`Fallback health server listening on http://0.0.0.0:${port}/health`))
}

try {
  if (started) {
    // Express app (has `get`) or similar
    if (typeof started.get === 'function') {
      started.get('/health', (req, res) => res.status(200).send('OK'))
      console.log('Health endpoint registered on existing Express app: /health')
    } else if (typeof started.on === 'function') {
      // http.Server: listen for requests and handle /health
      started.on('request', (req, res) => {
        if (req.url === '/health') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/plain')
          res.end('OK')
        }
      })
      console.log('Health endpoint registered on existing HTTP server: /health')
    } else {
      // Unknown return type
      startFallbackHealthServer()
    }
  } else {
    startFallbackHealthServer()
  }
} catch (err) {
  console.warn('Failed to attach /health to startServer return:', err)
  startFallbackHealthServer()
}