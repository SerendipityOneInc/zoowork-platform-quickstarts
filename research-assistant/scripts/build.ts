// esbuild recipe adapted from Anthropic's MIT src/main.ts; retained license in third-party/.
import { build } from 'esbuild'
import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export async function bundle(write = true, production = write): Promise<string> {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../web/app.tsx', import.meta.url))], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', minify: production, write: false,
    define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') } })
  const text = result.outputFiles[0].text
  if (write) {
    const { writeFile } = await import('node:fs/promises')
    await mkdir('dist', { recursive: true }); await writeFile('dist/app.js', text)
    await cp('web/app.css', 'dist/app.css'); await cp('web/index.html', 'dist/index.html')
  }
  return text
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await bundle()
