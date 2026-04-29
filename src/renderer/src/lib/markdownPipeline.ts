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

const IMAGE_EXTS_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i

/**
 * Normalise non-standard image syntax before handing off to the unified pipeline.
 *
 * Two cases that remark-parse can't handle on its own:
 *   1. Obsidian wiki-link embeds: ![[image.png]] or ![[folder/img.png]]
 *      → rewritten to standard markdown with a percent-encoded src so remark
 *        creates a proper image node.
 *   2. Standard syntax with spaces in the filename: ![alt](my photo.png)
 *      (not valid CommonMark — remark-parse silently drops these)
 *      → spaces are percent-encoded so remark accepts the node.
 *
 * The vault-file:// rewrite regex below decodes the src again before resolving
 * the path, so the round-trip is lossless.
 */
function preprocessImages(content: string): string {
  // Encode only spaces (and existing literal % signs to avoid double-encoding)
  function encodeSrc(src: string): string {
    return src.replace(/%/g, '%25').replace(/ /g, '%20')
  }

  // 1. Obsidian wiki-link image embeds: ![[image.png]] → ![image.png](image.png)
  content = content.replace(/!\[\[([^\]]+)\]\]/g, (match, src: string) => {
    if (!IMAGE_EXTS_RE.test(src.trim())) return match
    return `![${src}](${encodeSrc(src)})`
  })

  // 2. Standard markdown images whose src contains spaces — remark drops these.
  //    Skip external URLs (remark handles them + their optional "title" suffix fine).
  //    For local paths, strip any trailing "title" or 'title' before encoding.
  content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt: string, src: string) => {
    if (!src.includes(' ')) return match
    if (src.startsWith('http://') || src.startsWith('https://')) return match
    // Separate path from optional title: `path/to/img.png "Title"` or `path 'Title'`
    const titleMatch = src.match(/^([\s\S]*?)\s+(?:"[^"]*"|'[^']*')\s*$/)
    const path   = titleMatch ? titleMatch[1] : src
    const suffix = src.slice(path.length)          // title part, preserved verbatim
    if (!path.includes(' ')) return match           // only title had spaces — remark is fine
    return `![${alt}](${encodeSrc(path)}${suffix})`
  })

  return content
}

export async function renderMarkdown(
  content: string,
  ctx?: { vaultPath: string; noteRelPath: string },
): Promise<string> {
  const result = await processor.process(preprocessImages(content))
  let html = String(result)

  // Add line numbers to code blocks: wrap each line in <span class="code-line">
  // and stamp data-language on the <pre> for the CSS language badge.
  html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_m, codeAttrs, content) => {
    const langMatch = codeAttrs.match(/language-([^\s"'>]+)/)
    const lang = langMatch ? langMatch[1] : null
    const lines = content.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    const wrapped = lines
      .map(line => `<span class="code-line">${line || '​'}</span>`)
      .join('\n')
    const langAttr = lang ? ` data-language="${lang}"` : ''
    return `<pre${langAttr}><code${codeAttrs}>${wrapped}</code></pre>`
  })

  // Rewrite relative image src attributes to vault-file:// URLs so Electron
  // can load images from disk without relaxing webSecurity.
  if (ctx?.vaultPath) {
    html = html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/g, (_m, pre, src, post) => {
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('vault-file:')) {
        return `${pre}${src}${post}`
      }
      const noteDirParts = ctx.noteRelPath.split('/').slice(0, -1)
      const decodedSrc = decodeURI(src)          // undo any %20 from preprocessImages
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
      return `${pre}vault-file:///${encodeURI(resolved.join('/'))}${post}`
    })
  }

  return html
}
