import { app, BrowserWindow, shell, protocol } from 'electron'
import { join, extname } from 'path'
import { readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

// Register vault-file:// BEFORE app is ready (scheme must be declared upfront)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault-file',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  }
])
import { registerVaultHandlers } from './ipc/vault'
import { registerNotesHandlers } from './ipc/notes'
import { registerAuthHandlers } from './ipc/auth'
import { registerGitHandlers } from './ipc/git'
import { registerSearchHandlers } from './ipc/search'
import { registerImageHandlers } from './ipc/images'
import { registerWindowHandlers } from './ipc/window'
import { IPC } from '../types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC.WINDOW.MAXIMIZED)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC.WINDOW.UNMAXIMIZED)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mindpalace.app')

  // Serve vault files through a safe custom scheme so the renderer can load
  // images stored on disk without disabling webSecurity.
  // URL format: vault-file:///absolute/path/to/file.png
  const MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  }
  protocol.handle('vault-file', (request) => {
    try {
      const rawPath = request.url.slice('vault-file:///'.length)
      const filePath = decodeURI(rawPath)
      const data = readFileSync(filePath)
      const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(data, { headers: { 'Content-Type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerVaultHandlers()
  registerNotesHandlers()
  registerAuthHandlers()
  registerGitHandlers()
  registerSearchHandlers()
  registerImageHandlers()
  registerWindowHandlers()

  createWindow()

  // Check for updates in packaged builds only
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
