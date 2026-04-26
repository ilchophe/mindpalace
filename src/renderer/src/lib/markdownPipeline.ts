import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

// Allow className and style on all elements (needed by KaTeX and highlight.js)
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

export async function renderMarkdown(
  content: string,
  ctx?: { vaultPath: string; noteRelPath: string },
): Promise<string> {
  const result = await processor.process(content)
  let html = String(result)

  // Rewrite relative image src attributes to vault-file:// URLs so Electron
  // can load images from disk without relaxing webSecurity.
  if (ctx?.vaultPath) {
    html = html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/g, (_m, pre, src, post) => {
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('vault-file:')) {
        return `${pre}${src}${post}`
      }
      const noteDirParts = ctx.noteRelPath.split('/').slice(0, -1)
      const rawParts = [
        ...ctx.vaultPath.replace(/\\/g, '/').split('/'),
        ...noteDirParts,
        ...src.split('/')
      ]
      const resolved: string[] = []
      for (const seg of rawParts) {
        if (seg === '..') resolved.pop()
        else if (seg && seg !== '.') resolved.push(seg)
      }
      return `${pre}vault-file:///${encodeURI(resolved.join('/'))}${post}`
    })
  }

  return html
}
