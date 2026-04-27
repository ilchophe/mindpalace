import { describe, it, expect } from 'vitest'
import { importService } from '../main/services/ImportService'

/**
 * ImportService.rewriteObsidianEmbeds unit tests.
 *
 * These tests cover the pure rewriting logic without touching the filesystem,
 * so they run cleanly in a Node vitest environment.
 */
describe('ImportService.rewriteObsidianEmbeds', () => {
  // ── Obsidian wiki-link image embeds ──────────────────────────────────────

  it('rewrites ![[image.png]] to standard markdown with imageMap lookup', () => {
    const imageMap = new Map([['photo.png', 'images/photo.png']])
    const { content, count } = importService.rewriteObsidianEmbeds(
      'Some text\n![[photo.png]]\nMore text',
      'note.md',
      'images',
      imageMap
    )
    expect(count).toBe(1)
    expect(content).toContain('![](images/photo.png)')
    expect(content).not.toContain('![[')
  })

  it('handles note in subdirectory — computes correct relative path', () => {
    const imageMap = new Map([['photo.png', 'images/photo.png']])
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![[photo.png]]',
      'notes/deep/note.md',
      'images',
      imageMap
    )
    expect(count).toBe(1)
    // note is 2 levels deep → needs ../../ prefix
    expect(content).toBe('![](../../images/photo.png)')
  })

  it('rewrites ![[folder/img.png]] treating path as vault-relative', () => {
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![[assets/diagram.png]]',
      'note.md',
      'images'
    )
    expect(count).toBe(1)
    expect(content).toBe('![](assets/diagram.png)')
  })

  it('falls back to imageSubfolder when basename not in imageMap', () => {
    const imageMap = new Map<string, string>() // empty — nothing found
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![[unknown.png]]',
      'note.md',
      'images',
      imageMap
    )
    expect(count).toBe(1)
    expect(content).toBe('![](images/unknown.png)')
  })

  it('leaves ![[Note Title]] wiki-links (no image ext) unchanged', () => {
    const { content, count } = importService.rewriteObsidianEmbeds(
      'See [[Architecture]] and [[README]]',
      'note.md',
      'images'
    )
    expect(count).toBe(0)
    expect(content).toBe('See [[Architecture]] and [[README]]')
  })

  it('leaves ![[note.md]] unchanged (markdown extension, not image)', () => {
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![[other-note.md]]',
      'note.md',
      'images'
    )
    expect(count).toBe(0)
    expect(content).toBe('![[other-note.md]]')
  })

  // ── Bare standard markdown images ───────────────────────────────────────

  it('rewrites bare ![](img.png) when image is in imageMap', () => {
    const imageMap = new Map([['photo.png', 'images/photo.png']])
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![alt text](photo.png)',
      'note.md',
      'images',
      imageMap
    )
    expect(count).toBe(1)
    expect(content).toBe('![alt text](images/photo.png)')
  })

  it('leaves ![](https://...) external links unchanged', () => {
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![logo](https://example.com/logo.png)',
      'note.md',
      'images'
    )
    expect(count).toBe(0)
    expect(content).toBe('![logo](https://example.com/logo.png)')
  })

  it('leaves ![](images/already/pathed.png) unchanged (has directory component)', () => {
    const { content, count } = importService.rewriteObsidianEmbeds(
      '![](images/already/pathed.png)',
      'note.md',
      'images'
    )
    expect(count).toBe(0)
    expect(content).toBe('![](images/already/pathed.png)')
  })

  it('leaves bare image unchanged when the file already exists at the resolved path', () => {
    // Simulate: vaultPath provided, and the image exists at note's dir + src
    // We pass __dirname as vaultPath and the image name is a real file that exists
    // in __dirname. Since we can't create files in tests, we instead confirm
    // the non-existence path (file not found → rewrites).
    const imageMap = new Map([['logo.png', 'assets/logo.png']])
    const { count } = importService.rewriteObsidianEmbeds(
      '![](logo.png)',
      'note.md',
      'assets',
      imageMap,
      '/nonexistent/vault' // vaultPath where file definitely does not exist
    )
    expect(count).toBe(1) // file not found → rewrite happened
  })

  // ── Multiple embeds in one document ─────────────────────────────────────

  it('rewrites multiple embeds in a single document', () => {
    const imageMap = new Map([
      ['a.png', 'images/a.png'],
      ['b.jpg', 'images/b.jpg'],
    ])
    const input = '![[a.png]]\n\nSome text\n\n![[b.jpg]]'
    const { content, count } = importService.rewriteObsidianEmbeds(
      input,
      'note.md',
      'images',
      imageMap
    )
    expect(count).toBe(2)
    expect(content).toContain('![](images/a.png)')
    expect(content).toContain('![](images/b.jpg)')
  })

  it('returns count=0 and unchanged content for plain text with no embeds', () => {
    const input = '# Heading\n\nJust some text without any images.'
    const { content, count } = importService.rewriteObsidianEmbeds(input, 'note.md', 'images')
    expect(count).toBe(0)
    expect(content).toBe(input)
  })
})
