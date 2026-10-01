import { fixture } from './fixtures.js'
import { host } from '../src/main.js'
const f = await fixture()
f.platform.delay = 1000
const server = await host(f.research, true, Number(process.env.PORT ?? 3187))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(); void f.close().finally(() => process.exit(0))
})
