import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'path'
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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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
  protocol.handle('vault-file', async (request) => {
    const rawPath = request.url.slice('vault-file:///'.length)
    const filePath = decodeURI(rawPath)
    return net.fetch(`file:///${filePath}`)
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
