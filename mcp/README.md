# Drawo MCP — let agents draw into Drawo

Agents draw into the running **Drawo** app (tldraw) through this MCP server.
Drawo exposes a loopback control port (`127.0.0.1:3579`); this server translates MCP
tool calls into draw commands. **Drawo must be running** for the tools to work.

## Register it

### Claude Code
Add to `~/.claude.json` (global) or a project `.mcp.json`:

```json
{
  "mcpServers": {
    "drawo": {
      "command": "node",
      "args": ["C:\\Users\\Sanjar Barakayev\\AppData\\Local\\MiroLocal\\mcp\\server.mjs"]
    }
  }
}
```

Or one-liner:
`claude mcp add drawo -- node "C:\\Users\\Sanjar Barakayev\\AppData\\Local\\MiroLocal\\mcp\\server.mjs"`

Then restart the session. The ready-made snippet is in `mcp-config-snippet.json`.

## Tools

| Tool | What it does |
|---|---|
| `drawo_ping` | Check Drawo is running. |
| `drawo_clear_page` | Wipe the current page. |
| `drawo_mind_map` | Draw a mind map from a nested `{text, color?, children[]}` tree (auto layout + arrows). |
| `drawo_create_shapes` | Create arbitrary shapes: `geo` (rectangle/ellipse/diamond/...), `text`, `note` (sticky), `arrow`. |
| `drawo_export_svg` | Export the page as an SVG string. |
| `drawo_snapshot` | Get the full board as tldraw JSON. |

### Shape specs for `drawo_create_shapes`
- geo: `{type:"geo", x, y, w, h, text, geo:"rectangle", color, fill:"none|solid|semi|pattern"}`
- text: `{type:"text", x, y, text, color}`
- sticky: `{type:"note", x, y, text, color}`
- arrow: `{type:"arrow", x1, y1, x2, y2, color}`

Colors: `black blue green red orange violet yellow light-blue light-green light-red light-violet grey`.

## Notes
- Everything is local: loopback only, no data leaves the machine.
- Change the port with env `DRAWO_PORT` (must match the app).
