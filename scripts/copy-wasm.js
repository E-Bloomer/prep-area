import fs from 'node:fs'
import path from 'node:path'
const src = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')
const dstDir = path.resolve('public')
const dst = path.join(dstDir, 'sql-wasm.wasm')
try {
  if (!fs.existsSync(src)) {
    console.warn('[copy-wasm] sql-wasm.wasm not found. Did you run `npm i`?')
    process.exit(0)
  }
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
  fs.copyFileSync(src, dst)
  console.log('[copy-wasm] Copied to public/sql-wasm.wasm')
} catch (e) {
  console.warn('[copy-wasm] Failed to copy wasm:', e?.message || e)
}
