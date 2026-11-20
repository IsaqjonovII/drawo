// Drawo app-window preload. Bridges draw commands from the main process (loopback
// HTTP control port) into the tldraw renderer, and sends results back.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('drawoAPI', {
  onDraw: (cb) => ipcRenderer.on('drawo:cmd', (_e, msg) => cb(msg)),
  result: (id, data) => ipcRenderer.send('drawo:result', { id, data }),
  ready: () => ipcRenderer.send('drawo:ready'),
})
