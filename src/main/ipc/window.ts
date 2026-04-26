import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../types'

export function registerWindowHandlers(): void {
  ipcMain.handle(IPC.WINDOW.MINIMIZE, () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle(IPC.WINDOW.MAXIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle(IPC.WINDOW.CLOSE, () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle(IPC.WINDOW.IS_MAXIMIZED, () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })
}
