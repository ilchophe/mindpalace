import type { NoteMetadata } from '@shared'

export interface GraphNode {
  id: string
  title: string
  relativePath: string
  linkCount: number  // edges touching this node — used for radius sizing
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

function resolveOutlink(outlink: string, notes: NoteMetadata[]): NoteMetadata | undefined {
  const withMd = outlink.endsWith('.md') ? outlink : `${outlink}.md`
  return notes.find(
    (n) =>
      n.relativePath === outlink ||
      n.relativePath === withMd ||
      n.relativePath.endsWith(`/${outlink}`) ||
      n.relativePath.endsWith(`/${withMd}`) ||
      n.title.toLowerCase() === outlink.toLowerCase()
  )
}

export function buildGraphData(notes: NoteMetadata[]): GraphData {
  const nodeMap = new Map<string, GraphNode>()
  for (const note of notes) {
    nodeMap.set(note.id, { id: note.id, title: note.title, relativePath: note.relativePath, linkCount: 0 })
  }

  const links: GraphLink[] = []
  const seen = new Set<string>()

  for (const note of notes) {
    for (const outlink of note.outlinks) {
      const target = resolveOutlink(outlink, notes)
      if (!target || target.id === note.id) continue
      const key = `${note.id}→${target.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: note.id, target: target.id })
      const srcNode = nodeMap.get(note.id)
      const tgtNode = nodeMap.get(target.id)
      if (srcNode) srcNode.linkCount++
      if (tgtNode) tgtNode.linkCount++
    }
  }

  return { nodes: Array.from(nodeMap.values()), links }
}
