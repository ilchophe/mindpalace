import { ipcMain } from 'electron'
import { IPC } from '../../types'
import { searchService } from '../services/SearchService'
import { vaultService } from '../services/VaultService'

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC.SEARCH.QUERY, (_e, query: string) => {
    return searchService.search(query)
  })

  ipcMain.handle(IPC.SEARCH.REINDEX, () => {
    const config = vaultService.getActiveConfig()
    if (!config) return
    searchService.reindexVault(config.localPath)
  })

  ipcMain.handle(IPC.SEARCH.GET_ALL_TAGS, () => {
    return searchService.getAllTags()
  })

  ipcMain.handle(IPC.SEARCH.GET_BACKLINKS, (_e, relPath: string) => {
    return searchService.getBacklinks(relPath)
  })
}
