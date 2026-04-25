# skill: remark-rehype-pipeline

## Purpose
Convert Markdown strings to safe HTML using a unified remark→rehype pipeline. Supports GFM tables/task-lists, math (KaTeX), syntax highlighting (highlight.js), and sanitization.

## Key Packages
| Package | Role |
|---|---|
| `unified` v11 | Pipeline runner |
| `remark-parse` | Markdown → mdast |
| `remark-gfm` | GFM tables, strikethrough, task lists |
| `remark-math` | `$inline$` and `$$block$$` math |
| `remark-rehype` | mdast → hast |
| `rehype-katex` | Renders math nodes via KaTeX |
| `rehype-highlight` | Syntax highlighting via highlight.js |
| `rehype-sanitize` | Strips dangerous HTML |
| `rehype-stringify` | hast → HTML string |
| `gray-matter` | Frontmatter parse / stringify |

## File Locations
| File | Role |
|---|---|
| `src/renderer/src/lib/markdownPipeline.ts` | Pipeline singleton + `renderMarkdown()` |
| `src/renderer/src/lib/frontmatterParser.ts` | `parseFrontmatter()` / `stringifyFrontmatter()` |
| `src/renderer/src/components/Editor/MarkdownPreview.tsx` | React component (async render) |
| `src/renderer/src/components/Editor/PropertiesPanel.tsx` | YAML frontmatter R/W UI |

## Core Pattern

### Pipeline (renderer process only — ESM packages work in Vite)
```typescript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

// Allow className+style on all elements — required by KaTeX and highlight.js
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
  },
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeHighlight)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify)

export async function renderMarkdown(content: string): Promise<string> {
  const result = await processor.process(content)
  return String(result)
}
```

### React preview component (cancellation pattern)
```tsx
useEffect(() => {
  if (!tab) return
  let cancelled = false
  renderMarkdown(tab.content).then(result => {
    if (!cancelled) setHtml(result)
  })
  return () => { cancelled = true }
}, [tab?.content])
```

### Frontmatter parse / write
```typescript
import matter from 'gray-matter'

export function parseFrontmatter(raw: string) {
  const { data, content } = matter(raw)
  return { frontmatter: data, body: content }
}

export function stringifyFrontmatter(fm: Record<string, unknown>, body: string): string {
  if (Object.keys(fm).length === 0) return body
  return matter.stringify(body, fm)
}
```

## Known Quirks
- `rehype-highlight` v7 accepts no options (v6 `ignoreMissing` was removed — unknown languages render as plain text).
- `gray-matter` uses eval for coffeescript/JS front-matter engines — Vite warns during build but it's harmless in the renderer since `unsafe-eval` is already allowed in the CSP for Monaco.
- `remark-rehype` must receive `{ allowDangerousHtml: true }` for raw HTML blocks in markdown to pass through; `rehype-sanitize` handles the actual safety boundary.
- Pipeline is built once as a module-level singleton — `processor.process()` is safe to call concurrently.

## Reuse Notes
- All remark/rehype packages are ESM-only; they work in the Vite renderer bundle but must NOT be imported in the main process.
- CSS for rendered output lives in `src/renderer/src/styles/global.css` under `.markdown-preview { ... }`.
- To add wiki-link rendering: add a custom remark plugin before `remark-rehype` that visits `text` nodes and converts `[[link]]` patterns to link nodes.
