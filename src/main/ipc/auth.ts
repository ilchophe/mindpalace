import { ipcMain } from 'electron'
import { IPC } from '../../types'
import { authService } from '../services/AuthService'

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC.AUTH.GET_STATUS, () => authService.getStatus())

  ipcMain.handle(IPC.AUTH.SET_CLIENT_ID, (_e, clientId: string) => {
    authService.setClientId(clientId)
  })

  ipcMain.handle(IPC.AUTH.START_DEVICE_FLOW, (_e, clientId: string) =>
    authService.startDeviceFlow(clientId)
  )

  ipcMain.handle(IPC.AUTH.POLL_DEVICE_AUTH, (_e, clientId: string, deviceCode: string) =>
    authService.pollDeviceAuth(clientId, deviceCode)
  )

  ipcMain.handle(IPC.AUTH.LOGOUT, () => authService.clearToken())
}
