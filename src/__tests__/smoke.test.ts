import { describe, it, expect } from 'vitest'

describe('smoke test', () => {
  it('passes', () => {
    expect(true).toBe(true)
  })

  it('IPC constants are defined', async () => {
    const { IPC } = await import('../types/index')
    expect(IPC.NOTES.WRITE).toBe('notes:write')
    expect(IPC.GIT.SYNC).toBe('git:sync')
    expect(IPC.VAULT.OPEN).toBe('vault:open')
  })
})
