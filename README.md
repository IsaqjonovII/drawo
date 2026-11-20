# Drawo

A **local-first infinite whiteboard** with an **MCP server** so AI agents can draw on it —
mind maps, diagrams, feature visuals — in real time.

- **No login, no cloud.** Everything runs on your machine; your boards stay local.
- **Miro-style canvas** — infinite pan/zoom, shapes, arrows, sticky notes, frames, text, images, an adaptive square grid.
- **Agent-drawable** over a loopback control port via the bundled MCP server.

Built on [tldraw](https://tldraw.dev) (MIT) in an Electron shell.

---

## Layout

| Folder | What |
|---|---|
| `app/` | The whiteboard web app (tldraw + Vite). Runs in any browser or inside the desktop shell. |
| `desktop/` | Standalone Electron shell. Serves `app/` offline and opens the agent control port. |
| `mcp/` | MCP server exposing drawing tools to agents (`mind_map`, `create_shapes`, …). |

## Run it

```bash
# 1) build the whiteboard
cd app
npm install
npm run build

# 2) run the desktop app
cd ../desktop
npm install
npm start
```

The desktop app opens a window and listens on `127.0.0.1:3579` (loopback only).

## Let agents draw (MCP)

```bash
cd mcp
npm install
```

Register with Claude Code:

```bash
claude mcp add drawo -- node "/absolute/path/to/mcp/server.mjs"
```

Then, with Drawo running, ask your agent to *"draw a mind map of X"*. Tools:

| Tool | Does |
|---|---|
| `drawo_mind_map` | Draw a mind map from a nested `{text, color?, children[]}` tree (auto layout + arrows). |
| `drawo_create_shapes` | Arbitrary shapes: `geo` (rectangle/ellipse/diamond/…), `text`, `note`, `arrow`. |
| `drawo_clear_page` | Blank the current page. |
| `drawo_export_svg` | Export the page as SVG. |
| `drawo_snapshot` | Get the board as tldraw JSON. |
| `drawo_ping` | Check Drawo is running. |

See `mcp/README.md` for shape specs and colors.

## Control port (direct)

Anything that can POST JSON can draw. Example:

```bash
curl -s http://127.0.0.1:3579 -H 'content-type: application/json' -d '{
  "op": "mindmap",
  "root": { "text": "Drawo", "color": "blue", "children": [
    { "text": "local-first" }, { "text": "agent-drawable" }
  ] }
}'
```

## Notes

- `DRAWO_PORT` env var changes the control port (set it for both the desktop app and the MCP server).
- tldraw's free license shows a "Made with tldraw" watermark; this project hides it for local use. If you distribute a build, get a tldraw business license.
- Not affiliated with Miro. "Miro-style" describes the interaction model only.

## License

MIT — see [LICENSE](LICENSE). Bundles tldraw (MIT) and Inter (OFL).
