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

import { Decoration, type DecorationSet, EditorView, WidgetType, ViewPlugin } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { syntaxTree } from '@codemirror/language'
import { StateField, StateEffect, Facet, type Extension } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { tags } from '@lezer/highlight'

// ── Focus tracking ────────────────────────────────────────────────────────────
// Edit mode (showing raw markdown) only activates when the editor has focus
// AND the cursor is on that specific construct.  When unfocused (e.g. when
// the file first opens) every heading/code block/image renders in preview.

const focusEffect = StateEffect.define<boolean>()

const focusField = StateField.define<boolean>({
  create: () => false,
  update(focused, tr) {
    for (const e of tr.effects) {
      if (e.is(focusEffect)) return e.value
    }
    return focused
  }
})

const focusTracker = ViewPlugin.fromClass(
  class { constructor(readonly view: EditorView) {} },
  {
    eventHandlers: {
      focus(_e: FocusEvent, view: EditorView) {
        view.dispatch({ effects: focusEffect.of(true) })
      },
      blur(_e: FocusEvent, view: EditorView) {
        view.dispatch({ effects: focusEffect.of(false) })
      }
    }
  }
)

// ── highlight.js (syntax highlighting inside fenced code blocks) ─────────────
import hljs from 'highlight.js/lib/core'
import langBash       from 'highlight.js/lib/languages/bash'
import langShell      from 'highlight.js/lib/languages/shell'
import langYaml       from 'highlight.js/lib/languages/yaml'
import langJs         from 'highlight.js/lib/languages/javascript'
import langTs         from 'highlight.js/lib/languages/typescript'
import langPython     from 'highlight.js/lib/languages/python'
import langJson       from 'highlight.js/lib/languages/json'
import langSql        from 'highlight.js/lib/languages/sql'
import langCss        from 'highlight.js/lib/languages/css'
import langXml        from 'highlight.js/lib/languages/xml'
import langGo         from 'highlight.js/lib/languages/go'
import langRust       from 'highlight.js/lib/languages/rust'
import langCpp        from 'highlight.js/lib/languages/cpp'
import langMarkdown   from 'highlight.js/lib/languages/markdown'
import langDiff       from 'highlight.js/lib/languages/diff'

hljs.registerLanguage('bash',       langBash)
hljs.registerLanguage('sh',         langBash)
hljs.registerLanguage('shell',      langShell)
hljs.registerLanguage('yaml',       langYaml)
hljs.registerLanguage('yml',        langYaml)
hljs.registerLanguage('javascript', langJs)
hljs.registerLanguage('js',         langJs)
hljs.registerLanguage('typescript', langTs)
hljs.registerLanguage('ts',         langTs)
hljs.registerLanguage('python',     langPython)
hljs.registerLanguage('py',         langPython)
hljs.registerLanguage('json',       langJson)
hljs.registerLanguage('sql',        langSql)
hljs.registerLanguage('css',        langCss)
hljs.registerLanguage('html',       langXml)
hljs.registerLanguage('xml',        langXml)
hljs.registerLanguage('go',         langGo)
hljs.registerLanguage('rust',       langRust)
hljs.registerLanguage('rs',         langRust)
hljs.registerLanguage('cpp',        langCpp)
hljs.registerLanguage('c',          langCpp)
hljs.registerLanguage('markdown',   langMarkdown)
hljs.registerLanguage('md',         langMarkdown)
hljs.registerLanguage('diff',       langDiff)

/** Highlight code with hljs; falls back to plain text on unknown language. */
function hljsHighlight(code: string, lang: string): string {
  const key = lang.toLowerCase()
  try {
    if (key && hljs.getLanguage(key)) {
      return hljs.highlight(code, { language: key, ignoreIllegals: true }).value
    }
    // Auto-detect only for short snippets to keep it fast
    if (code.length < 4000) {
      return hljs.highlightAuto(code).value
    }
  } catch { /* fall through */ }
  // Escape HTML for plain-text display
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Note context facet ────────────────────────────────────────────────────────
// Injected by CodeMirrorEditor so the Image widget can resolve vault-relative paths.

export interface NoteContext { vaultPath: string; noteRelPath: string }

export const noteContextFacet = Facet.define<NoteContext, NoteContext>({
  combine: (vals) => vals[vals.length - 1] ?? { vaultPath: '', noteRelPath: '' }
})

/** Resolve an image src (relative to the note) to a vault-file:// URL. */
function toVaultFileUrl(ctx: NoteContext, imgSrc: string): string {
  if (!ctx.vaultPath || imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
    return imgSrc
  }
  // Build absolute path: vaultPath/noteDirSegments/imgSrcSegments, then normalise ..
  const noteDirParts = ctx.noteRelPath.split('/').slice(0, -1)
  const decodedSrc  = decodeURI(imgSrc)          // undo any %20 from preprocessImages
  const rawParts = [
    ...ctx.vaultPath.replace(/\\/g, '/').split('/'),
    ...noteDirParts,
    ...decodedSrc.split('/')
  ]
  const resolved: string[] = []
  for (const seg of rawParts) {
    if (seg === '..') resolved.pop()
    else if (seg && seg !== '.') resolved.push(seg)
  }
  return `vault-file:///${encodeURI(resolved.join('/'))}`
}

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
    readonly from: number,
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return other.lang === this.lang && other.code === this.code
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-rendered-codeblock'

    // Click anywhere on the block → move cursor into the fenced code syntax
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({ selection: { anchor: this.from } })
      view.focus()
    })

    if (this.lang) {
      const label = document.createElement('span')
      label.className = 'cm-codeblock-lang'
      label.textContent = this.lang
      wrap.appendChild(label)
    }

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = this.lang ? `hljs language-${this.lang}` : 'hljs'

    // Wrap each line in a span so CSS counters can add line numbers.
    // hljs output is line-oriented for most languages so splitting on \n is safe.
    const highlighted = hljsHighlight(this.code, this.lang)
    const lines = highlighted.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    code.innerHTML = lines
      .map(line => `<span class="cm-code-line">${line || '​'}</span>`)
      .join('\n')

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

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly resolvedUrl: string,
    /** Character offset of the `!` — used to move the cursor here on click */
    readonly from: number,
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.resolvedUrl === this.resolvedUrl && other.alt === this.alt
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-rendered-image'

    // Clicking the widget (image or error placeholder) moves the cursor into
    // the image syntax so the decoration is torn down and raw markdown shows.
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({ selection: { anchor: this.from } })
      view.focus()
    })

    const img = document.createElement('img')
    img.src = this.resolvedUrl
    img.alt = this.alt
    img.className = 'cm-rendered-img'
    // Show a styled placeholder when the file can't be loaded (wrong path / missing file)
    img.onerror = () => {
      wrap.innerHTML = ''
      wrap.className = 'cm-rendered-image-error'
      const icon = document.createElement('span')
      icon.textContent = '🖼'
      icon.className = 'cm-image-error-icon'
      const label = document.createElement('span')
      label.className = 'cm-image-error-label'
      const filename = this.src.split('/').pop() ?? this.src
      label.textContent = `Image not found: ${filename}`
      label.title = this.src
      // Re-attach click handler after innerHTML reset
      wrap.addEventListener('mousedown', (e) => {
        e.preventDefault()
        view.dispatch({ selection: { anchor: this.from } })
        view.focus()
      })
      wrap.appendChild(icon)
      wrap.appendChild(label)
    }
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

// ── Decoration builder ───────────────────────────────────────────────────────

function buildDecorations(state: EditorState): DecorationSet {
  const deco: Range<Decoration>[] = []
  const noteCtx = state.facet(noteContextFacet)
  // Only switch to raw/edit mode when the editor is focused; unfocused = full preview
  const isFocused = state.field(focusField, false) ?? false

  try {
    syntaxTree(state).iterate({
      enter(node): false | void {
        const { from, to, name } = node

        // ── ATX Headings (H1–H6) ────────────────────────────────────────────
        if (/^ATXHeading[1-6]$/.test(name)) {
          // Use the heading's own line end (not node.to which includes \n)
          // so cursor on the *next* line does not keep this heading in raw mode
          const lineEnd = state.doc.lineAt(from).to
          if (isFocused && cursorOverlaps(state, from, lineEnd)) return false

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
          if (isFocused && cursorOverlaps(state, from, to)) return false

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
              widget: new CodeBlockWidget(lang, code, startLine.from),
              block: true,
            }).range(startLine.from, endLine.to),
          )
          return false
        }

        // ── Inline code ──────────────────────────────────────────────────────
        if (name === 'InlineCode') {
          if (isFocused && cursorOverlaps(state, from, to)) return false

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
          if (isFocused && cursorOverlaps(state, from, to)) return false

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
          if (isFocused && cursorOverlaps(state, from, to)) return false

          if (from + 1 < to - 1) {
            deco.push(Decoration.replace({}).range(from, from + 1))
            deco.push(Decoration.mark({ class: 'cm-live-em' }).range(from + 1, to - 1))
            deco.push(Decoration.replace({}).range(to - 1, to))
          }
          return false
        }

        // ── Links [text](url) ────────────────────────────────────────────────
        if (name === 'Link') {
          if (isFocused && cursorOverlaps(state, from, to)) return false

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

        // ── Images ![alt](src) ───────────────────────────────────────────────
        if (name === 'Image') {
          if (isFocused && cursorOverlaps(state, from, to)) return false

          const text = state.sliceDoc(from, to)
          const match = text.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
          if (match) {
            const alt = match[1]
            // Strip optional CommonMark title: ![alt](url "Title") or ![alt](url 'Title')
            // match[2] contains everything inside (), including the title if present
            const src = match[2].replace(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/, '').trim()
            const resolvedUrl = toVaultFileUrl(noteCtx, src)
            const widget = new ImageWidget(src, alt, resolvedUrl, from)

            // Use a block decoration when the image is the only content on its
            // line — this fixes Up-arrow cursor jump caused by tall inline widgets.
            const lineObj = state.doc.lineAt(from)
            if (lineObj.text.trim() === text.trim()) {
              deco.push(
                Decoration.replace({ widget, block: true }).range(lineObj.from, lineObj.to),
              )
            } else {
              deco.push(Decoration.replace({ widget }).range(from, to))
            }
          }
          return false
        }

        // ── Horizontal rule ──────────────────────────────────────────────────
        if (name === 'HorizontalRule') {
          if (isFocused && cursorOverlaps(state, from, to)) return false

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

  // ── Regex fallback: images with spaces in src (not valid CommonMark so the
  // syntax tree never emits an Image node for them) ──────────────────────────
  // Build a fast range-occupied lookup from what we already decorated
  const occupied = new Set(deco.map(d => `${d.from}:${d.to}`))
  const docText = state.doc.toString()
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let im: RegExpExecArray | null
  while ((im = imgRe.exec(docText)) !== null) {
    // Strip optional CommonMark title before checking for spaces in the path
    const srcRaw = im[2]
    const src = srcRaw.replace(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/, '').trim()
    if (!src.includes(' ')) continue                          // already handled by syntax tree
    const from = im.index
    const to   = from + im[0].length
    if (occupied.has(`${from}:${to}`)) continue               // already decorated
    if (isFocused && cursorOverlaps(state, from, to)) continue
    const resolvedUrl = toVaultFileUrl(noteCtx, src)
    const widget = new ImageWidget(src, im[1], resolvedUrl, from)
    const lineObj = state.doc.lineAt(from)
    if (lineObj.text.trim() === im[0].trim()) {
      deco.push(Decoration.replace({ widget, block: true }).range(lineObj.from, lineObj.to))
    } else {
      deco.push(Decoration.replace({ widget }).range(from, to))
    }
  }

  // ── Regex fallback: Obsidian wiki-link image embeds ![[image.png]] ──────────
  const wikiImgRe = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico))\]\]/gi
  let wi: RegExpExecArray | null
  while ((wi = wikiImgRe.exec(docText)) !== null) {
    const src  = wi[1]
    const from = wi.index
    const to   = from + wi[0].length
    if (occupied.has(`${from}:${to}`)) continue
    if (isFocused && cursorOverlaps(state, from, to)) continue
    const resolvedUrl = toVaultFileUrl(noteCtx, src)
    const widget = new ImageWidget(src, src.split('/').pop() ?? src, resolvedUrl, from)
    const lineObj = state.doc.lineAt(from)
    if (lineObj.text.trim() === wi[0].trim()) {
      deco.push(Decoration.replace({ widget, block: true }).range(lineObj.from, lineObj.to))
    } else {
      deco.push(Decoration.replace({ widget }).range(from, to))
    }
  }

  return Decoration.set(deco.sort((a, b) => a.from - b.from))
}

// ── Unified StateField ────────────────────────────────────────────────────────
// StateField (unlike ViewPlugin) may provide block:true decorations.

const livePreviewField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(deco, tr) {
    const focusChanged = tr.effects.some(e => e.is(focusEffect))
    if (tr.docChanged || tr.selection || focusChanged) return buildDecorations(tr.state)
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// focusField and focusTracker must come BEFORE livePreviewField in the extension
// list so the field is registered in the state when livePreviewField first reads it.
export const livePreviewPlugin: Extension = [focusField, focusTracker, livePreviewField]

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
    padding: '10px 0',
    margin: '6px 0',
    overflow: 'hidden',
    counterReset: 'code-line',
  },
  '.cm-rendered-codeblock pre': {
    margin: '0',
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.875em',
    lineHeight: '1.55',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'break-word',
    color: 'var(--vault-text)',
  },
  '.cm-rendered-codeblock code': { background: 'transparent', padding: '0', border: 'none', display: 'block' },
  '.cm-codeblock-lang': {
    position: 'absolute',
    top: '7px',
    right: '12px',
    fontSize: '0.72em',
    color: 'var(--vault-muted)',
    textTransform: 'lowercase',
    letterSpacing: '0.03em',
    userSelect: 'none',
    zIndex: '1',
  },
  // Line-number rows inside code blocks
  '.cm-code-line': {
    display: 'block',
    paddingLeft: '3.8em',
    paddingRight: '16px',
    minHeight: '1.55em',
    position: 'relative',
    backgroundImage: 'repeating-linear-gradient(to right, transparent 0, transparent calc(2ch - 1px), rgba(255,255,255,0.035) calc(2ch - 1px), rgba(255,255,255,0.035) 2ch)',
    backgroundPosition: '3.8em 0',
  },
  '.cm-code-line::before': {
    counterIncrement: 'code-line',
    content: 'counter(code-line)',
    position: 'absolute',
    left: '0',
    width: '3em',
    textAlign: 'right',
    paddingRight: '0.6em',
    color: 'var(--vault-muted)',
    opacity: '0.4',
    fontSize: '0.85em',
    lineHeight: 'inherit',
    borderRight: '1px solid var(--vault-border)',
    userSelect: 'none',
    pointerEvents: 'none',
  },

  // Inline image widget
  '.cm-rendered-image': { display: 'inline-block', lineHeight: '0', verticalAlign: 'middle' },
  '.cm-rendered-img': {
    maxWidth: '100%',
    maxHeight: '480px',
    borderRadius: '4px',
    display: 'block',
    margin: '4px 0',
  },
  '.cm-rendered-image-error': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px dashed var(--vault-border)',
    background: 'rgba(255,80,80,0.06)',
    cursor: 'default',
  },
  '.cm-image-error-icon': {
    fontSize: '1em',
    opacity: '0.6',
  },
  '.cm-image-error-label': {
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.78em',
    color: 'var(--vault-muted)',
    maxWidth: '400px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
