import matter from 'gray-matter'

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
}

export function parseFrontmatter(raw: string): ParsedNote {
  const { data, content } = matter(raw)
  return { frontmatter: data as Record<string, unknown>, body: content }
}

export function stringifyFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  if (Object.keys(frontmatter).length === 0) return body
  return matter.stringify(body, frontmatter)
}
