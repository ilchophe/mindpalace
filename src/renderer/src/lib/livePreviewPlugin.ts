/**
 * CodeMirror 6 live-preview plugin for MindPalace.
 *
 * Uses a single StateField so both block (FencedCode, HorizontalRule) and
 * inline (headings, bold, italic, inline code, links) decorations come from
 * the same source.  ViewPlugin cannot provide block:true decorations; a
 * StateField has no such restriction.
 *
 * The field rebuilds whenever the transaction changes the document or the
 * selection, so moving the cursor in/out of a construct immediately toggles
 * between preview and raw-edit appearance.
 */

import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { syntaxTree } from '@codemirror/language'
import { StateField, type Extension } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { tags } from '@lezer/highlight'

// ── Cursor overlap check ─────────────────────────────────────────────────────

function cursorOverlaps(state: EditorState, from: number, to: number): boolean {
  for (const sel of state.selection.ranges) {
    if (sel.from <= to && sel.to >= from) return true
  }
  return false
}

// ── Widgets ──────────────────────────────────────────────────────────────────

class CodeBlockWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly code: string,
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return other.lang === this.lang && other.code === this.code
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-rendered-codeblock'

    if (this.lang) {
      const label = document.createElement('span')
      label.className = 'cm-codeblock-lang'
      label.textContent = this.lang
      wrap.appendChild(label)
    }

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = this.code
    pre.appendChild(code)
    wrap.appendChild(pre)
    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-rendered-hr'
    return hr
  }
}

// ── Decoration builder ───────────────────────────────────────────────────────

function buildDecorations(state: EditorState): DecorationSet {
  const deco: Range<Decoration>[] = []

  try {
    syntaxTree(state).iterate({
      enter(node): false | void {
        const { from, to, name } = node

        // ── ATX Headings (H1–H6) ────────────────────────────────────────────
        if (/^ATXHeading[1-6]$/.test(name)) {
          // Use the heading's own line end (not node.to which includes \n)
          // so cursor on the *next* line does not keep this heading in raw mode
          const lineEnd = state.doc.lineAt(from).to
          if (cursorOverlaps(state, from, lineEnd)) return false

          const level = parseInt(name.slice(-1), 10)
          const markerLen = level + 1 // e.g. "## " = 2 + 1 space
          const markerEnd = from + markerLen

          if (markerEnd < to) {
            deco.push(Decoration.replace({}).range(from, markerEnd))
            deco.push(
              Decoration.mark({ class: `cm-live-h cm-live-h${level}` }).range(markerEnd, lineEnd),
            )
          }
          return false
        }

        // ── Fenced code blocks ───────────────────────────────────────────────
        if (name === 'FencedCode') {
          if (cursorOverlaps(state, from, to)) return false

          const text = state.sliceDoc(from, to)
          const lines = text.split('\n')
          const lang = lines[0].replace(/^[`~]+/, '').trim()
          const code = lines
            .slice(1, lines[lines.length - 1].match(/^[`~]{3}/) ? -1 : undefined)
            .join('\n')

          const startLine = state.doc.lineAt(from)
          const endLine = state.doc.lineAt(Math.max(from, to - 1))

          deco.push(
            Decoration.replace({
              widget: new CodeBlockWidget(lang, code),
              block: true,
            }).range(startLine.from, endLine.to),
          )
          return false
        }

        // ── Inline code ──────────────────────────────────────────────────────
        if (name === 'InlineCode') {
          if (cursorOverlaps(state, from, to)) return false

          const text = state.sliceDoc(from, to)
          const fenceMatch = text.match(/^(`+)/)
          const fLen = fenceMatch ? fenceMatch[1].length : 1

          if (from + fLen < to - fLen) {
            deco.push(Decoration.replace({}).range(from, from + fLen))
            deco.push(Decoration.mark({ class: 'cm-live-code' }).range(from + fLen, to - fLen))
            deco.push(Decoration.replace({}).range(to - fLen, to))
          }
          return false
        }

        // ── Strong emphasis (**bold** / __bold__) ────────────────────────────
        if (name === 'StrongEmphasis') {
          if (cursorOverlaps(state, from, to)) return false

          const mLen = 2
          if (from + mLen < to - mLen) {
            deco.push(Decoration.replace({}).range(from, from + mLen))
            deco.push(Decoration.mark({ class: 'cm-live-strong' }).range(from + mLen, to - mLen))
            deco.push(Decoration.replace({}).range(to - mLen, to))
          }
          return false
        }

        // ── Emphasis (*italic* / _italic_) ───────────────────────────────────
        if (name === 'Emphasis') {
          if (cursorOverlaps(state, from, to)) return false

          if (from + 1 < to - 1) {
            deco.push(Decoration.replace({}).range(from, from + 1))
            deco.push(Decoration.mark({ class: 'cm-live-em' }).range(from + 1, to - 1))
            deco.push(Decoration.replace({}).range(to - 1, to))
          }
          return false
        }

        // ── Links [text](url) ────────────────────────────────────────────────
        if (name === 'Link') {
          if (cursorOverlaps(state, from, to)) return false

          const text = state.sliceDoc(from, to)
          const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
          if (match) {
            const linkTextStart = from + 1
            const linkTextEnd = from + 1 + match[1].length
            deco.push(Decoration.replace({}).range(from, linkTextStart))
            deco.push(
              Decoration.mark({ class: 'cm-live-link' }).range(linkTextStart, linkTextEnd),
            )
            deco.push(Decoration.replace({}).range(linkTextEnd, to))
          }
          return false
        }

        // ── Horizontal rule ──────────────────────────────────────────────────
        if (name === 'HorizontalRule') {
          if (cursorOverlaps(state, from, to)) return false

          const startLine = state.doc.lineAt(from)
          const endLine = state.doc.lineAt(Math.max(from, to - 1))

          deco.push(
            Decoration.replace({
              widget: new HrWidget(),
              block: true,
            }).range(startLine.from, endLine.to),
          )
          return false
        }
        return
      },
    })
  } catch (err) {
    console.error('[livePreview] decoration build error:', err)
    return Decoration.none
  }

  return Decoration.set(deco.sort((a, b) => a.from - b.from))
}

// ── Unified StateField ────────────────────────────────────────────────────────
// StateField (unlike ViewPlugin) may provide block:true decorations.

const livePreviewField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state)
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

export const livePreviewPlugin: Extension = livePreviewField

// ── Syntax highlight style (raw text when cursor is inside a construct) ───────

export const markdownHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.monospace, fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: '0.875em' },
    { tag: tags.link, color: 'var(--vault-accent)' },
    { tag: tags.url, color: 'var(--vault-muted)', fontSize: '0.85em' },
    { tag: tags.processingInstruction, color: 'var(--vault-muted)' },
    { tag: tags.punctuation, color: 'var(--vault-muted)' },
  ]),
)

// ── Theme ─────────────────────────────────────────────────────────────────────

export const mindpalaceTheme = EditorView.theme({
  '&': { fontSize: '16px', background: 'transparent', height: '100%' },
  '.cm-scroller': {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: '1.8',
    color: 'var(--vault-text)',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  '.cm-content': {
    padding: '48px 24px 100px',
    caretColor: 'var(--vault-accent)',
    color: 'var(--vault-text)',
    maxWidth: '720px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  '.cm-line': { padding: '0', color: 'var(--vault-text)' },
  '.cm-gutters': { display: 'none' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--vault-accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--vault-accent) 22%, transparent)',
  },
  '.cm-activeLine': { background: 'transparent' },

  // Headings
  '.cm-live-h': { display: 'inline', fontWeight: '700', color: 'var(--vault-text)' },
  '.cm-live-h1': { fontSize: '1.75em', lineHeight: '1.3' },
  '.cm-live-h2': { fontSize: '1.375em', lineHeight: '1.35' },
  '.cm-live-h3': { fontSize: '1.15em' },
  '.cm-live-h4': { fontSize: '1em' },
  '.cm-live-h5': { fontSize: '0.9em' },
  '.cm-live-h6': { fontSize: '0.875em', color: 'var(--vault-muted)' },

  // Inline formatting
  '.cm-live-strong': { fontWeight: '700' },
  '.cm-live-em': { fontStyle: 'italic' },
  '.cm-live-code': {
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.875em',
    background: 'var(--vault-surface)',
    border: '1px solid var(--vault-border)',
    borderRadius: '3px',
    padding: '0.1em 0.35em',
  },
  '.cm-live-link': { color: 'var(--vault-accent)', textDecoration: 'underline', cursor: 'pointer' },

  // Fenced code block widget
  '.cm-rendered-codeblock': {
    position: 'relative',
    display: 'block',
    background: 'var(--vault-surface)',
    border: '1px solid var(--vault-border)',
    borderRadius: '6px',
    padding: '12px 16px',
    margin: '6px 0',
    overflow: 'auto',
  },
  '.cm-rendered-codeblock pre': {
    margin: '0',
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.875em',
    lineHeight: '1.55',
    whiteSpace: 'pre',
    color: 'var(--vault-text)',
  },
  '.cm-rendered-codeblock code': { background: 'transparent', padding: '0', border: 'none' },
  '.cm-codeblock-lang': {
    position: 'absolute',
    top: '7px',
    right: '12px',
    fontSize: '0.72em',
    color: 'var(--vault-muted)',
    textTransform: 'lowercase',
    letterSpacing: '0.03em',
    userSelect: 'none',
  },

  // Horizontal rule widget
  '.cm-rendered-hr': {
    display: 'block',
    width: '100%',
    border: 'none',
    borderTop: '1px solid var(--vault-border)',
    margin: '10px 0',
  },
})
