// Local Hono host adapted from Anthropic's MIT quickstart; see ../REFERENCES.md.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { bundle } from '../scripts/build.js'
import { createApi } from './app.js'
import { processLease, webRuntime } from './web-runtime.js'
import { safeError, FoundationError } from './platform.js'
import type { Research } from './turns.js'

export async function host(research: Research, fixture = false, port = Number(process.env.PORT ?? 3000)) {
  const app = new Hono()
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new FoundationError('invalid_port')
  const file = (name: string) => fileURLToPath(new URL('../web/' + name, import.meta.url))
  app.use('*', async (c, next) => { c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'no-referrer'); await next() })
  app.get('/', async c => c.html(await readFile(file('index.html'), 'utf8')))
  app.get('/app.css', async c => c.body(await readFile(file('app.css'), 'utf8'), 200, { 'content-type': 'text/css' }))
  let cached: string | undefined
  app.get('/app.js', async c => c.body(process.env.NODE_ENV === 'production' ? cached ??= await bundle(false, true) : await bundle(false), 200, { 'content-type': 'text/javascript' }))
  app.route('/', createApi(research, fixture))
  return serve({ fetch: app.fetch, port, hostname: '127.0.0.1', serverOptions: { requestTimeout: 0 } },
    () => console.log(`Research Assistant: http://localhost:${port}${fixture ? ' (offline fixture)' : ''}`))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let release: (() => Promise<void>) | undefined
  try {
    release = await processLease()
    const research = await webRuntime(), server = await host(research)
    server.on('error', () => { void release!().finally(() => { console.error('Cannot listen on the configured port'); process.exit(1) }) })
    for (const event of ['SIGINT', 'SIGTERM'] as const) process.once(event, () => {
      void release!().finally(() => { server.close(); process.exit(0) })
    })
  } catch (error) { if (release) await release(); console.error(`Cannot start: ${safeError(error)}`); process.exitCode = 1 }
}
