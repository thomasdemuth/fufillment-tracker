// Serves dist-hosted the way GitHub Pages does: under /<repo>/ with 404.html as the SPA fallback.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('dist-hosted')
const base = process.env.VITE_BASE || '/fufillment-tracker/'
const port = Number(process.env.PORT || 4173)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (!url.pathname.startsWith(base)) {
      res.writeHead(302, { Location: base })
      return res.end()
    }
    const rel = url.pathname.slice(base.length)
    let file = path.join(root, rel)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, '404.html')
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, () => console.log(`hosted UI at http://localhost:${port}${base}`))
