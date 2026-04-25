import { ipcMain } from 'electron'
import { IPC } from '../../types'
import { imageService } from '../services/ImageService'

export function registerImageHandlers(): void {
  ipcMain.handle(
    IPC.IMAGES.PASTE,
    (_e, noteRelPath: string, base64Data: string, mimeType: string) =>
      imageService.paste(noteRelPath, base64Data, mimeType)
  )

  ipcMain.handle(
    IPC.IMAGES.IMPORT_FILE,
    (_e, noteRelPath: string, sourcePath: string) =>
      imageService.importFile(noteRelPath, sourcePath)
  )

  ipcMain.handle(
    IPC.IMAGES.REWRITE_PATHS,
    (_e, oldRelPath: string, newRelPath: string, content: string) =>
      imageService.rewritePaths(oldRelPath, newRelPath, content)
  )

  ipcMain.handle(IPC.IMAGES.GET_MODE, () => imageService.getMode())
}
