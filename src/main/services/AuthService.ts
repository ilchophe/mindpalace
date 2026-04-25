import { safeStorage } from 'electron'
import { settingsStore } from '../store'
import type { DeviceFlowStart, DeviceFlowPollResult, AuthStatus, GitHubUser } from '../../types'

class AuthService {
  async startDeviceFlow(clientId: string): Promise<DeviceFlowStart> {
    const resp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo user:email' })
    })
    const data = (await resp.json()) as Record<string, unknown>
    if (data.error) {
      throw new Error((data.error_description as string) ?? (data.error as string))
    }
    return {
      deviceCode: data.device_code as string,
      userCode: data.user_code as string,
      verificationUri: data.verification_uri as string,
      expiresIn: data.expires_in as number,
      interval: data.interval as number
    }
  }

  async pollDeviceAuth(clientId: string, deviceCode: string): Promise<DeviceFlowPollResult> {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const data = (await resp.json()) as Record<string, unknown>

    if (data.access_token) {
      this.setToken(data.access_token as string)
      try {
        await this.fetchAndStoreUser(data.access_token as string)
      } catch {
        // user info is nice-to-have — don't fail auth over it
      }
      return { status: 'authorized', token: data.access_token as string }
    }

    switch (data.error) {
      case 'authorization_pending': return { status: 'pending' }
      case 'slow_down':             return { status: 'slow_down' }
      case 'expired_token':         return { status: 'expired' }
      case 'access_denied':         return { status: 'denied' }
      default:
        return {
          status: 'error',
          errorMessage: (data.error_description as string) ?? (data.error as string) ?? 'Unknown error'
        }
    }
  }

  getToken(): string | null {
    const hex = settingsStore.get('settings.githubTokenEncrypted') as string
    if (!hex) return null
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(hex, 'hex'))
      }
      return null
    } catch {
      return null
    }
  }

  setToken(token: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token)
      settingsStore.set('settings.githubTokenEncrypted', encrypted.toString('hex'))
    }
    // If safeStorage unavailable (headless Linux without keyring): warn only, don't store plaintext
  }

  clearToken(): void {
    settingsStore.set('settings.githubTokenEncrypted', '')
    settingsStore.set('settings.githubUser', null)
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null
  }

  getUser(): GitHubUser | null {
    return (settingsStore.get('settings.githubUser') as GitHubUser | null) ?? null
  }

  getClientId(): string {
    return (settingsStore.get('settings.githubClientId') as string) ?? ''
  }

  setClientId(clientId: string): void {
    settingsStore.set('settings.githubClientId', clientId)
  }

  getStatus(): AuthStatus {
    return {
      isAuthenticated: this.isAuthenticated(),
      user: this.getUser(),
      clientId: this.getClientId()
    }
  }

  private async fetchAndStoreUser(token: string): Promise<void> {
    const [userResp, emailResp] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
      })
    ])

    const user = (await userResp.json()) as Record<string, unknown>
    const emails = (await emailResp.json()) as Array<{ email: string; primary: boolean }>
    const primaryEmail =
      emails.find((e) => e.primary)?.email ?? (user.email as string) ?? 'mindpalace@local'

    settingsStore.set('settings.githubUser', {
      login: user.login as string,
      name: (user.name as string) ?? (user.login as string),
      email: primaryEmail,
      avatarUrl: user.avatar_url as string
    })
  }
}

export const authService = new AuthService()
