import { describe, it, expect } from 'vitest'
import { IPC } from '../types/index'

/**
 * IPC channel contract tests.
 * Guards against accidental renames that would silently break the
 * preload↔main bridge — the renderer calls window.api.* which maps
 * 1-to-1 to these string constants.
 */
describe('IPC channel constants', () => {
  describe('VAULT', () => {
    it('has lifecycle channels', () => {
      expect(IPC.VAULT.OPEN).toBe('vault:open')
      expect(IPC.VAULT.CLONE).toBe('vault:clone')
      expect(IPC.VAULT.CREATE).toBe('vault:create')
      expect(IPC.VAULT.GET_CONFIG).toBe('vault:getConfig')
      expect(IPC.VAULT.UPDATE_CONFIG).toBe('vault:updateConfig')
      expect(IPC.VAULT.CLOSE).toBe('vault:close')
    })

    it('has multi-vault registry channels', () => {
      expect(IPC.VAULT.LIST).toBe('vault:list')
      expect(IPC.VAULT.SWITCH).toBe('vault:switch')
      expect(IPC.VAULT.GET_ACTIVE).toBe('vault:getActive')
      expect(IPC.VAULT.PIN).toBe('vault:pin')
      expect(IPC.VAULT.DELETE).toBe('vault:delete')
      expect(IPC.VAULT.PICK_FOLDER).toBe('vault:pickFolder')
    })

    it('has push event channels', () => {
      expect(IPC.VAULT.FILE_CHANGED).toBe('vault:file-changed')
      expect(IPC.VAULT.FILE_CREATED).toBe('vault:file-created')
      expect(IPC.VAULT.FILE_DELETED).toBe('vault:file-deleted')
      expect(IPC.VAULT.REGISTRY_CHANGED).toBe('vault:registry-changed')
    })

    it('has import channels', () => {
      expect(IPC.VAULT.IMPORT_FOLDER).toBe('vault:importFolder')
      expect(IPC.VAULT.IMPORT_PROGRESS).toBe('vault:importProgress')
    })
  })

  describe('NOTES', () => {
    it('has CRUD channels', () => {
      expect(IPC.NOTES.LIST).toBe('notes:list')
      expect(IPC.NOTES.READ).toBe('notes:read')
      expect(IPC.NOTES.WRITE).toBe('notes:write')
      expect(IPC.NOTES.RENAME).toBe('notes:rename')
      expect(IPC.NOTES.DELETE).toBe('notes:delete')
    })

    it('has auxiliary channels', () => {
      expect(IPC.NOTES.CREATE_FOLDER).toBe('notes:createFolder')
      expect(IPC.NOTES.GET_BACKLINKS).toBe('notes:getBacklinks')
      expect(IPC.NOTES.RESOLVE_WIKI_LINK).toBe('notes:resolveWikiLink')
      expect(IPC.NOTES.SHOW_IN_EXPLORER).toBe('notes:showInExplorer')
      expect(IPC.NOTES.CONFIRM).toBe('notes:confirm')
      expect(IPC.NOTES.LIST_ASSETS).toBe('notes:listAssets')
    })
  })

  describe('GIT', () => {
    it('has core sync channels', () => {
      expect(IPC.GIT.STATUS).toBe('git:status')
      expect(IPC.GIT.SYNC).toBe('git:sync')
      expect(IPC.GIT.GET_LOG).toBe('git:getLog')
      expect(IPC.GIT.CONNECT_REMOTE).toBe('git:connectRemote')
      expect(IPC.GIT.SET_SYNC_INTERVAL).toBe('git:setSyncInterval')
    })

    it('has push event channels', () => {
      expect(IPC.GIT.SYNC_STATUS).toBe('git:sync-status')
      expect(IPC.GIT.CONFLICT_DETECTED).toBe('git:conflict-detected')
    })
  })

  describe('AUTH', () => {
    it('has all expected channels', () => {
      expect(IPC.AUTH.START_DEVICE_FLOW).toBe('auth:startDeviceFlow')
      expect(IPC.AUTH.POLL_DEVICE_AUTH).toBe('auth:pollDeviceAuth')
      expect(IPC.AUTH.GET_STATUS).toBe('auth:getAuthStatus')
      expect(IPC.AUTH.LOGOUT).toBe('auth:logout')
      expect(IPC.AUTH.SET_CLIENT_ID).toBe('auth:setClientId')
    })
  })

  describe('SEARCH', () => {
    it('has expected channels', () => {
      expect(IPC.SEARCH.QUERY).toBe('search:query')
      expect(IPC.SEARCH.REINDEX).toBe('search:reindexVault')
      expect(IPC.SEARCH.GET_ALL_TAGS).toBe('search:getAllTags')
      expect(IPC.SEARCH.GET_BACKLINKS).toBe('search:getBacklinks')
    })
  })

  describe('WINDOW', () => {
    it('has expected channels', () => {
      expect(IPC.WINDOW.MINIMIZE).toBeDefined()
      expect(IPC.WINDOW.MAXIMIZE).toBeDefined()
      expect(IPC.WINDOW.CLOSE).toBeDefined()
    })
  })

  it('all channel strings follow domain:verb or domain:verb-word format', () => {
    const allChannels = [
      ...Object.values(IPC.VAULT),
      ...Object.values(IPC.NOTES),
      ...Object.values(IPC.GIT),
      ...Object.values(IPC.AUTH),
      ...Object.values(IPC.SEARCH),
      ...Object.values(IPC.WINDOW),
    ]
    for (const ch of allChannels) {
      expect(ch, `channel "${ch}" must match domain:word format`).toMatch(/^[a-z]+:[a-zA-Z]/)
    }
  })
})
