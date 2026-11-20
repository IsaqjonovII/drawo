#!/usr/bin/env node
// Drawo MCP server. Exposes drawing tools to agents; each tool POSTs a JSON command
// to the Drawo app's loopback control port (127.0.0.1:3579). Drawo must be running.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const PORT = Number(process.env.DRAWO_PORT || 3579)
const BASE = `http://127.0.0.1:${PORT}`

async function send(cmd) {
  let res
  try {
    res = await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    })
  } catch (e) {
    return { ok: false, error: `Cannot reach Drawo at ${BASE}. Is the Drawo app running? (${e.message})` }
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { ok: false, error: `Bad response: ${text.slice(0, 200)}` } }
}
const reply = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })

const server = new McpServer({ name: 'drawo', version: '1.0.0' })

// --- recursive mind-map node schema ---
const mindNode = z.lazy(() =>
  z.object({
    text: z.string().describe('label for this node'),
    color: z.string().optional().describe('black|blue|green|red|orange|violet|yellow|grey ...'),
    children: z.array(mindNode).optional(),
  })
)

server.tool(
  'drawo_ping',
  'Check that the Drawo whiteboard app is running and reachable.',
  {},
  async () => reply(await send({ op: 'ping' }))
)

server.tool(
  'drawo_clear_page',
  'Delete every shape on the current Drawo page (start from a blank canvas).',
  {},
  async () => reply(await send({ op: 'clear' }))
)

server.tool(
  'drawo_mind_map',
  'Draw a mind map from a nested tree. Auto-lays-out boxes left-to-right by depth and connects them with arrows. Great for feature breakdowns and concept maps.',
  { root: mindNode.describe('the root node, with nested children') },
  async ({ root }) => reply(await send({ op: 'mindmap', root }))
)

server.tool(
  'drawo_create_shapes',
  'Create arbitrary shapes on the canvas. Each shape: {type:"geo"|"text"|"note"|"arrow", ...}. '
  + 'geo: x,y,w,h,text,geo(rectangle|ellipse|diamond|triangle|...),color,fill(none|solid|semi|pattern). '
  + 'text: x,y,text,color. note (sticky): x,y,text,color. arrow: x1,y1,x2,y2,color.',
  { shapes: z.array(z.record(z.any())).describe('array of shape specs'),
    zoom: z.boolean().optional().describe('zoom to fit after (default true)') },
  async ({ shapes, zoom }) => reply(await send({ op: 'create', shapes, zoom }))
)

server.tool(
  'drawo_export_svg',
  'Export the current page as an SVG string (for saving or embedding a visual).',
  {},
  async () => reply(await send({ op: 'export_svg' }))
)

server.tool(
  'drawo_snapshot',
  'Get the current board as a tldraw JSON snapshot (full document state).',
  {},
  async () => reply(await send({ op: 'snapshot' }))
)

const transport = new StdioServerTransport()
await server.connect(transport)
