// Browser tests only (started by playwright.config.ts): the real app with the
// fake Platform from fixtures.js. Application code and npm scripts never start it.
import { fixture } from './fixtures.js'
import { host } from '../src/main.js'
const f = await fixture()
f.platform.delay = 1000
f.platform.briefDelay = 2500
const server = await host(f.research, Number(process.env.PORT ?? 3187))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(); void f.close().finally(() => process.exit(0))
})
