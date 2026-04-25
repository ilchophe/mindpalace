import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { buildGraphData, type GraphNode } from '../../lib/graphDataBuilder'
import { useEditorStore } from '../../stores/editorStore'
import type { NoteMetadata } from '@shared'

// D3 simulation extends nodes and links with positional data at runtime
interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode
  target: string | SimNode
}

interface Props {
  onClose: () => void
}

export default function GraphView({ onClose }: Props): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [notes, setNotes] = useState<NoteMetadata[]>([])
  const { activeTabId, tabs, openTab } = useEditorStore()

  useEffect(() => {
    window.api.notes.list().then(setNotes)
  }, [])

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return

    const { nodes: rawNodes, links: rawLinks } = buildGraphData(notes)
    const nodes: SimNode[] = rawNodes.map((n) => ({ ...n }))
    const links: SimLink[] = rawLinks.map((l) => ({ ...l }))

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current)
    svg.selectAll('*').remove()

    const { width, height } = svgRef.current.getBoundingClientRect()
    const activeRelPath = tabs.find((t) => t.id === activeTabId)?.relativePath

    // Zoom container
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 8])
      .on('zoom', (event) => g.attr('transform', event.transform.toString()))
    svg.call(zoom)

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(90))
      .force('charge', d3.forceManyBody<SimNode>().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>(18))

    // Links
    const linkSel = g
      .append('g')
      .attr('stroke', '#45475a')
      .attr('stroke-opacity', 0.7)
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1)

    // Nodes
    const nodeSel = g
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => Math.max(4, Math.min(14, 4 + d.linkCount * 2)))
      .attr('fill', (d) =>
        d.relativePath === activeRelPath ? '#cba6f7' : '#89b4fa'
      )
      .attr('stroke', '#1e1e2e')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        openTab({
          id: d.id,
          relativePath: d.relativePath,
          title: d.title,
          tags: [],
          aliases: [],
          frontmatter: {},
          outlinks: [],
          inlinks: [],
          wordCount: 0,
          createdAt: '',
          modifiedAt: '',
        })
        onClose()
      })
      .call(
        d3
          .drag<SVGCircleElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Labels
    const labelSel = g
      .append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.title)
      .attr('font-size', '10px')
      .attr('fill', '#cdd6f4')
      .attr('dx', 10)
      .attr('dy', 4)
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // Native SVG title tooltip
    nodeSel.append('title').text((d) => d.title)

    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0)
      nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      labelSel.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0)
    })

    return () => { simulation.stop() }
  }, [notes, activeTabId, tabs, openTab, onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[82vw] h-[82vh] bg-vault-surface border border-vault-border rounded-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-vault-border flex-shrink-0">
          <span className="text-sm font-medium text-vault-text">
            Graph View
            {notes.length > 0 && (
              <span className="ml-2 text-vault-muted font-normal">
                {notes.length} notes
              </span>
            )}
          </span>
          <div className="flex items-center gap-3 text-xs text-vault-muted">
            <span>Scroll to zoom · Drag to pan · Click node to open</span>
            <button
              onClick={onClose}
              className="text-vault-muted hover:text-vault-text text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>
        {notes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-vault-muted text-sm">
            No notes in vault
          </div>
        ) : (
          <svg ref={svgRef} className="flex-1 w-full" style={{ background: '#1e1e2e' }} />
        )}
      </div>
    </div>
  )
}
