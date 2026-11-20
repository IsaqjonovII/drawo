import React from 'react'
import ReactDOM from 'react-dom/client'
import { Tldraw, Editor, createShapeId, useEditor, useTools, toRichText, DefaultMenuPanel, TldrawUiButton, TldrawUiButtonIcon } from 'tldraw'
import { useValue } from '@tldraw/state-react'
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
const rt = (t: any) => toRichText(String(t ?? ''))

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
          richText: rt(s.text), color: color(s.color), size: s.size || 'm',
        }})
      } else if (s.type === 'note') {
        editor.createShape({ id, type: 'note', x: s.x || 0, y: s.y || 0, props: {
          richText: rt(s.text), color: color(s.color), font: font(s.font),
        }})
      } else { // geo (rectangle/ellipse/diamond/...)
        editor.createShape({ id, type: 'geo', x: s.x || 0, y: s.y || 0, props: {
          geo: s.geo || 'rectangle', w: s.w || 200, h: s.h || 80,
          richText: rt(s.text), color: color(s.color),
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
      for (const ci of childInfos) arrows.push([id, ci.id])
      return { id, cx: x + NODE_W / 2, cy: yCenter, top: y, bottom: y + NODE_H }
    }
    layout(msg.root || { text: 'Root' }, 0)
    const ids: string[] = []
    for (const s of shapes) {
      editor.createShape({ id: s.id, type: 'geo', x: s.x, y: s.y, props: {
        geo: 'rectangle', w: s.w, h: s.h, richText: rt(s.text), color: s.color,
        fill: s.fill, size: 'm', font: 'sans', align: 'middle', verticalAlign: 'middle',
      }})
      ids.push(s.id)
    }
    for (const [pid, cid] of arrows) {
      const aid = createShapeId()
      editor.createShape({ id: aid, type: 'arrow', props: { color: 'grey', size: 's' } })
      editor.createBindings([
        { type: 'arrow', fromId: aid, toId: pid, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
        { type: 'arrow', fromId: aid, toId: cid, props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } },
      ])
      ids.push(aid)
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


// GPU-composited square grid (CSS gradients, not SVG patterns) — adaptive cell size,
// theme-aware via CSS vars. Repainting is a cheap compositor op, so pan/zoom stays smooth.
function SquareGrid({ x, y, z }: any) {
  const TARGET_MIN = 48, TARGET_MAX = 96
  let cell = 25 * z
  while (cell < TARGET_MIN) cell *= 2
  while (cell > TARGET_MAX) cell /= 2
  const major = cell * 5
  const ox = x * z, oy = y * z
  const wrap = (v: number, p: number) => ((v % p) + p) % p
  const mn = "var(--drawo-grid-minor)", mj = "var(--drawo-grid-major)"
  const style: any = {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: [
      `linear-gradient(${mj} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${mj} 1px, transparent 1px)`,
      `linear-gradient(${mn} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${mn} 1px, transparent 1px)`,
    ].join(","),
    backgroundSize: [`${major}px ${major}px`, `${major}px ${major}px`, `${cell}px ${cell}px`, `${cell}px ${cell}px`].join(","),
    backgroundPosition: [
      `${wrap(ox, major)}px ${wrap(oy, major)}px`,
      `${wrap(ox, major)}px ${wrap(oy, major)}px`,
      `${wrap(ox, cell)}px ${wrap(oy, cell)}px`,
      `${wrap(ox, cell)}px ${wrap(oy, cell)}px`,
    ].join(","),
  }
  return <div className="tl-grid drawo-grid" style={style} />
}

// ---- Drawo top-left board pill: logo + board name + default menu/undo ----
function BoardPill() {
  return (
    <div className="drawo-menupanel">
      <img className="drawo-logo" src="./drawo-mark.png" alt="Drawo" draggable={false} />
      <span className="drawo-name">Untitled board</span>
      <DefaultMenuPanel />
    </div>
  )
}

// ---- Drawo left vertical tool rail (Miro-style) ----
const RAIL_TOOLS = ['select', 'hand', 'draw', 'eraser', 'arrow', 'text', 'note', 'geo', 'frame']
function LeftRail() {
  const editor = useEditor()
  const tools = useTools()
  const current = useValue('currentTool', () => editor.getCurrentToolId(), [editor])
  const items = RAIL_TOOLS.map((id) => (tools as any)[id]).filter(Boolean)
  return (
    <div className="drawo-rail">
      {items.map((t: any) => {
        const active = current === t.id
        return (
          <TldrawUiButton
            key={t.id}
            type="icon"
            title={t.label}
            className={'drawo-rail-btn' + (active ? ' active' : '')}
            onClick={() => t.onSelect('toolbar')}
          >
            <TldrawUiButtonIcon icon={t.icon} />
          </TldrawUiButton>
        )
      })}
    </div>
  )
}

// ---- Drawo top-right: avatar + Share ----
function TopRight() {
  return (
    <div className="drawo-sharepanel">
      <div className="drawo-avatar" title="You">I</div>
      <button className="drawo-share-btn" type="button" onClick={() => (window as any).drawoAPI?.result?.('share', {}) }>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Share
      </button>
    </div>
  )
}

const components = { Grid: SquareGrid, MenuPanel: BoardPill, SharePanel: TopRight, Toolbar: LeftRail }

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawo-v4"
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
