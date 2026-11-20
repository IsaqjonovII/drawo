import React from 'react'
import ReactDOM from 'react-dom/client'
import { Tldraw, Editor, createShapeId, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import '@fontsource-variable/inter'

// tldraw's formatAssetUrl treats the custom drawo:// scheme as relative and prepends "/",
// producing "/drawo://app/..." which fails to load. Strip that stray leading slash.
function fixUrls(o: any): any {
  if (typeof o === 'string') return o.startsWith('/') && o.includes('://') ? o.slice(1) : o
  if (Array.isArray(o)) return o.map(fixUrls)
  if (o && typeof o === 'object') { const r: any = {}; for (const k in o) r[k] = fixUrls(o[k]); return r }
  return o
}
const assetUrls = fixUrls(getAssetUrlsByImport())

const COLORS = ['black','blue','green','red','orange','violet','yellow','light-blue','light-green','light-red','light-violet','grey']
const FONTS = ['sans','serif','mono','draw']
function color(c: any) { return COLORS.includes(c) ? c : 'black' }
function font(f: any) { return FONTS.includes(f) ? f : 'sans' }

// ---- command processor: agents send these via the MCP/HTTP bridge ----
function applyCommand(editor: Editor, msg: any): any {
  const op = msg.op
  if (op === 'ping') return { ok: true, app: 'Drawo' }

  if (op === 'clear') {
    const ids = Array.from(editor.getCurrentPageShapeIds())
    if (ids.length) editor.deleteShapes(ids)
    return { ok: true, cleared: ids.length }
  }

  if (op === 'create') {
    // msg.shapes: [{type:'text'|'note'|'geo'|'arrow', x,y,w,h,text,color,geo,...}]
    const created: string[] = []
    for (const s of (msg.shapes || [])) {
      const id = createShapeId()
      if (s.type === 'arrow') {
        editor.createShape({ id, type: 'arrow', x: 0, y: 0, props: {
          start: { x: s.x1 ?? 0, y: s.y1 ?? 0 }, end: { x: s.x2 ?? 100, y: s.y2 ?? 0 },
          color: color(s.color), size: s.size || 'm', font: font(s.font),
        }})
      } else if (s.type === 'text') {
        editor.createShape({ id, type: 'text', x: s.x || 0, y: s.y || 0, props: {
          text: String(s.text ?? ''), color: color(s.color), size: s.size || 'm',
        }})
      } else if (s.type === 'note') {
        editor.createShape({ id, type: 'note', x: s.x || 0, y: s.y || 0, props: {
          text: String(s.text ?? ''), color: color(s.color), font: font(s.font),
        }})
      } else { // geo (rectangle/ellipse/diamond/...)
        editor.createShape({ id, type: 'geo', x: s.x || 0, y: s.y || 0, props: {
          geo: s.geo || 'rectangle', w: s.w || 200, h: s.h || 80,
          text: String(s.text || ''), color: color(s.color),
          fill: s.fill || 'none', size: s.size || 'm', font: font(s.font), align: 'middle', verticalAlign: 'middle',
        }})
      }
      created.push(id)
    }
    if (msg.zoom !== false) editor.zoomToFit({ animation: { duration: 200 } })
    return { ok: true, ids: created }
  }

  if (op === 'mindmap') {
    // msg.root: { text, color?, children?: [ ...same shape... ] }
    const NODE_W = 200, NODE_H = 64, GAP_X = 300, GAP_Y = 28
    let cursorY = 0
    const shapes: any[] = []
    const arrows: Array<[any, any]> = []
    function layout(node: any, depth: number): { id: any; cx: number; cy: number; top: number; bottom: number } {
      const id = createShapeId()
      const x = depth * (NODE_W + GAP_X - 100)
      const kids = node.children || []
      let yCenter: number
      let childInfos: any[] = []
      if (kids.length === 0) {
        yCenter = cursorY + NODE_H / 2
        cursorY += NODE_H + GAP_Y
      } else {
        childInfos = kids.map((k: any) => layout(k, depth + 1))
        yCenter = (childInfos[0].cy + childInfos[childInfos.length - 1].cy) / 2
      }
      const y = yCenter - NODE_H / 2
      shapes.push({ id, x, y, w: NODE_W, h: NODE_H, text: node.text ?? '', color: color(node.color ?? (depth === 0 ? 'blue' : 'black')), fill: depth === 0 ? 'solid' : 'none' })
      for (const ci of childInfos) arrows.push([{ x: x + NODE_W, y: yCenter }, { x: ci.cx - NODE_W / 2, y: ci.cy }])
      return { id, cx: x + NODE_W / 2, cy: yCenter, top: y, bottom: y + NODE_H }
    }
    layout(msg.root || { text: 'Root' }, 0)
    const ids: string[] = []
    for (const s of shapes) {
      editor.createShape({ id: s.id, type: 'geo', x: s.x, y: s.y, props: {
        geo: 'rectangle', w: s.w, h: s.h, text: String(s.text ?? ''), color: s.color,
        fill: s.fill, size: 'm', font: 'sans', align: 'middle', verticalAlign: 'middle',
      }})
      ids.push(s.id)
    }
    for (const [a, b] of arrows) {
      const id = createShapeId()
      editor.createShape({ id, type: 'arrow', x: 0, y: 0, props: { start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, color: 'grey', size: 's' } })
      ids.push(id)
    }
    editor.zoomToFit({ animation: { duration: 200 } })
    return { ok: true, nodes: shapes.length, ids }
  }

  if (op === 'export_svg') {
    const ids = Array.from(editor.getCurrentPageShapeIds())
    return editor.getSvgString(ids).then((r: any) => ({ ok: true, svg: r ? r.svg : null }))
  }

  if (op === 'snapshot') {
    return { ok: true, snapshot: editor.getSnapshot() }
  }

  return { ok: false, error: 'unknown op: ' + op }
}


// Miro-style square grid: ADAPTIVE cell size (stays ~constant on screen as you zoom,
// stepping in powers of 2) with very light lines. Minor lines + stronger major every 5.
function SquareGrid({ x, y, z }: any) {
  const TARGET_MIN = 48, TARGET_MAX = 96  // comfortable on-screen cell size (px)
  let cell = 25 * z                        // 25 page-units at current zoom
  while (cell < TARGET_MIN) cell *= 2
  while (cell > TARGET_MAX) cell /= 2
  const major = cell * 5
  const phase = (off: number, period: number) => { const m = (off * z) % period; return 0.5 + (m > 0 ? m : period + m) }
  const mx = phase(x, cell), my = phase(y, cell)
  const Mx = phase(x, major), My = phase(y, major)
  return (
    <svg className="tl-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" style={{ shapeRendering: 'crispEdges' as any }}>
      <defs>
        <pattern id="drawo-grid-minor" width={cell} height={cell} patternUnits="userSpaceOnUse">
          <path d={`M ${mx} 0 L ${mx} ${cell} M 0 ${my} L ${cell} ${my}`} stroke="rgba(0,0,0,0.045)" strokeWidth={1} fill="none" />
        </pattern>
        <pattern id="drawo-grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
          <path d={`M ${Mx} 0 L ${Mx} ${major} M 0 ${My} L ${major} ${My}`} stroke="rgba(0,0,0,0.09)" strokeWidth={1} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#drawo-grid-minor)" />
      <rect width="100%" height="100%" fill="url(#drawo-grid-major)" />
    </svg>
  )
}

const components = { Grid: SquareGrid }

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawo"
        assetUrls={assetUrls}
        components={components}
        onMount={(editor) => {
          const api = (window as any).drawoAPI
          ;(window as any).drawoEditor = editor
          editor.updateInstanceState({ isGridMode: true })
          if (api && api.onDraw) {
            api.onDraw(async (msg: any) => {
              let res: any
              try { res = await applyCommand(editor, msg) }
              catch (e: any) { res = { ok: false, error: String(e && e.message || e) } }
              api.result(msg.id, res)
            })
            api.ready && api.ready()
          }
        }}
      />
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
