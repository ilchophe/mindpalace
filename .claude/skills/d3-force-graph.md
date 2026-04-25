# skill: d3-force-graph

## Purpose
D3.js v7 force-directed backlink graph rendered inside a React component for Electron. Nodes are vault notes; edges are wiki-link outlinks resolved from the SQLite index. Supports zoom/pan, node drag, and click-to-open.

## Key Files
| File | Role |
|---|---|
| `src/renderer/src/lib/graphDataBuilder.ts` | Builds `GraphData` (nodes + links) from `NoteMetadata[]` |
| `src/renderer/src/components/Graph/GraphView.tsx` | D3 force simulation in React, modal overlay |

## Data Model
```typescript
interface GraphNode { id: string; title: string; relativePath: string; linkCount: number }
interface GraphLink { source: string; target: string }
interface GraphData  { nodes: GraphNode[]; links: GraphLink[] }

// D3 simulation extends nodes at runtime; extend for TypeScript safety
interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimLink  extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode; target: string | SimNode
}
```

## Outlink Resolution
```typescript
function resolveOutlink(outlink: string, notes: NoteMetadata[]): NoteMetadata | undefined {
  const withMd = outlink.endsWith('.md') ? outlink : `${outlink}.md`
  return notes.find(n =>
    n.relativePath === outlink || n.relativePath === withMd ||
    n.relativePath.endsWith(`/${outlink}`) || n.relativePath.endsWith(`/${withMd}`) ||
    n.title.toLowerCase() === outlink.toLowerCase()
  )
}
```

## D3 Force Simulation Pattern (React + TypeScript)
```typescript
// In useEffect — runs after notes load; cleanup stops simulation
const nodes: SimNode[] = rawNodes.map(n => ({ ...n }))
const links: SimLink[] = rawLinks.map(l => ({ ...l }))

const simulation = d3.forceSimulation<SimNode>(nodes)
  .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(90))
  .force('charge', d3.forceManyBody<SimNode>().strength(-250))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide<SimNode>(18))

simulation.on('tick', () => {
  linkSel.attr('x1', d => (d.source as SimNode).x ?? 0) // etc.
  nodeSel.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
})
return () => { simulation.stop() }
```

## Zoom + Pan
```typescript
const g = svg.append('g')
const zoom = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.05, 8])
  .on('zoom', event => g.attr('transform', event.transform.toString()))
svg.call(zoom)
// All nodes/links go inside g, not svg directly
```

## Node Drag
```typescript
nodeSel.call(
  d3.drag<SVGCircleElement, SimNode>()
    .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
    .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y })
    .on('end',   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
)
```

## Node Sizing + Active Highlight
```typescript
.attr('r', d => Math.max(4, Math.min(14, 4 + d.linkCount * 2)))  // radius by degree
.attr('fill', d => d.relativePath === activeRelPath ? '#cba6f7' : '#89b4fa')  // Catppuccin purple/blue
```

## Reuse Notes
- D3 mutates node objects in-place (`x`, `y`, `vx`, `vy`, `fx`, `fy`); always spread them before passing to simulation to avoid mutating state
- `d3.forceLink` needs `id` accessor that matches the `source`/`target` strings in links — after simulation starts, `source` and `target` become `SimNode` references
- `svg.selectAll('*').remove()` before re-drawing prevents duplicate layers on re-render
- Use `useEffect` deps `[notes, activeTabId, tabs, openTab, onClose]` — `onClose` must be stable (defined at call site with `useCallback` or inline `setState`)
- `d3` and `@types/d3` are already in `package.json`; no extra install needed
- The overlay uses `fixed inset-0 z-50` pattern; backdrop click calls `onClose`, inner panel calls `e.stopPropagation()`
