/**
 * CodeMirror 6 live-preview plugin for MindPalace.
 *
 * When the cursor is OUTSIDE a markdown construct the raw syntax markers are
 * hidden and a styled representation is shown in their place — mirroring
 * Obsidian's "Live Preview" mode.  When the cursor moves inside the node the
 * raw markdown is revealed so the user can edit it.
 *
 * CM6 rule: block decorations (block:true) MUST come from a StateField, not a
 * ViewPlugin.  Inline decorations (Decoration.mark / non-block replace) are
 * fine in a ViewPlugin.
 *
 * Handled constructs:
 *   ATX headings (H1–H6) · fenced code blocks · inline code
 *   bold (StrongEmphasis) · italic (Emphasis) · links · horizontal rules
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { syntaxTree } from '@codemirror/language'
import { StateField, type Extension } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { tags } from '@lezer/highlight'

// ── Cursor overlap check ─────────────────────────────────────────────────────

function cursorOverlaps(state: EditorState, from: number, to: number): boolean {
  for (const sel of state.selection.ranges) {
    if (sel.from < to && sel.to > from) return true
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

// ── Block decorations (StateField) ───────────────────────────────────────────
// CM6 requires block:true decorations to come from a StateField, not a plugin.

function buildBlockDecorations(state: EditorState): DecorationSet {
  const deco: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter(node): false | void {
      const { from, to, name } = node

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

  return Decoration.set(deco.sort((a, b) => a.from - b.from))
}

const blockDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state)
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildBlockDecorations(tr.state)
    }
    return decorations
  },
  provide(field) {
    return EditorView.decorations.from(field)
  },
})

// ── Inline decorations (ViewPlugin) ─────────────────────────────────────────
// Inline Decoration.replace and Decoration.mark are allowed in ViewPlugins.

function buildInlineDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const deco: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter(node): false | void {
      const { from, to, name } = node

      // ── ATX Headings (H1–H6) ────────────────────────────────────────────
      if (/^ATXHeading[1-6]$/.test(name)) {
        if (cursorOverlaps(state, from, to)) return false

        const level = parseInt(name.slice(-1), 10)
        const markerLen = level + 1 // "## " = 2 hashes + 1 space
        const markerEnd = from + markerLen

        if (markerEnd <= to) {
          deco.push(Decoration.replace({}).range(from, markerEnd))
          deco.push(
            Decoration.mark({ class: `cm-live-h cm-live-h${level}` }).range(markerEnd, to),
          )
        }
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
      return
    },
  })

  return Decoration.set(
    deco.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide),
  )
}

const inlineDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildInlineDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// ── Syntax highlight style (raw text shown when cursor is nearby) ─────────────

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

// ── Combined export ───────────────────────────────────────────────────────────
// CM6 flattens nested extension arrays, so this is valid as a single Extension.

export const livePreviewPlugin: Extension = [blockDecorationField, inlineDecorationPlugin]

// ── Theme ─────────────────────────────────────────────────────────────────────

export const mindpalaceTheme = EditorView.theme({
  '&': { fontSize: '15px', background: 'transparent', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    lineHeight: '1.75',
    color: 'var(--vault-text)',
    overflowY: 'auto',
  },
  '.cm-content': {
    padding: '24px 32px 64px',
    caretColor: 'var(--vault-accent)',
    color: 'var(--vault-text)',
    maxWidth: '860px',
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
