// Drawo desktop shell (standalone Electron app).
// Serves the bundled tldraw app over a privileged drawo:// scheme and opens a
// loopback HTTP control port so local agents (via the MCP server) can draw.
const { app, BrowserWindow, protocol, ipcMain, net, session } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

// built tldraw app (vite build): ./app/dist when packaged, ../app/dist in the repo checkout
const APP_DIR = [path.join(__dirname, 'app', 'dist'), path.join(__dirname, '..', 'app', 'dist')]
  .find((p) => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, '..', 'app', 'dist')
const CONTROL_PORT = Number(process.env.DRAWO_PORT || 3579)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.map': 'application/json', '.ico': 'image/x-icon',
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'drawo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

let win
const pending = new Map()

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 640, minHeight: 480,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#ffffff',
    title: 'Drawo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.loadURL('drawo://app/index.html')
}

function startControlServer() {
  ipcMain.on('drawo:result', (_e, payload) => {
    const resolver = pending.get(payload.id)
    if (resolver) { pending.delete(payload.id); resolver(payload.data) }
  })
  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ app: 'Drawo', ok: true, hint: 'POST a JSON command here' }))
      return
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy() })
    req.on('end', () => {
      let cmd
      try { cmd = JSON.parse(body) }
      catch { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid JSON' })); return }
      if (!win || !win.webContents) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'window not ready' })); return }
      const id = Date.now() + '_' + Math.random().toString(36).slice(2)
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); res.writeHead(504, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'renderer timeout' })) }
      }, 20000)
      pending.set(id, (data) => { clearTimeout(timer); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)) })
      win.webContents.send('drawo:cmd', Object.assign({ id }, cmd))
    })
  })
  server.on('error', (e) => console.error('[drawo] control server:', e.message))
  server.listen(CONTROL_PORT, '127.0.0.1', () => console.log(`[drawo] control port http://127.0.0.1:${CONTROL_PORT}`))
}

app.whenReady().then(() => {
  protocol.handle('drawo', (request) => {
    try {
      const u = new URL(request.url)
      let rel = decodeURIComponent(u.pathname || '/')
      if (rel === '/' || rel === '') rel = '/index.html'
      const fp = path.normalize(path.join(APP_DIR, rel))
      if (fp !== APP_DIR && !fp.startsWith(APP_DIR + path.sep)) return new Response('Forbidden', { status: 403 })
      const data = fs.readFileSync(fp)
      const ext = path.extname(fp).toLowerCase()
      return new Response(data, { headers: { 'content-type': TYPES[ext] || 'application/octet-stream' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  // Local-first guarantee: block any outbound Google Fonts request so the app never
  // phones out for fonts. Canvas/UI fall back to the system/Noto stack (see app CSS).
  try {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] },
      (_details, cb) => cb({ cancel: true })
    )
  } catch (e) { console.error('[drawo] font-block failed:', e.message) }
  startControlServer()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
