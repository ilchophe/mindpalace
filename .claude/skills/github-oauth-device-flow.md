# skill: github-oauth-device-flow

## Purpose
Authenticate an Electron desktop app against GitHub using Device Flow (no redirect server required).
Stores the token encrypted via Electron's `safeStorage` OS keychain API.

## Key Files
| File | Role |
|---|---|
| `src/main/services/AuthService.ts` | Device Flow logic + safeStorage encryption |
| `src/main/store.ts` | `settingsStore` — persists clientId, encrypted token, user info |
| `src/main/ipc/auth.ts` | IPC handlers: getStatus, setClientId, startDeviceFlow, pollDeviceAuth, logout |
| `src/renderer/src/stores/syncStore.ts` | Renderer auth state + Device Flow polling loop |
| `src/renderer/src/components/Auth/ConnectGitHubModal.tsx` | Multi-step modal: configure → authenticate → connect vault |

## Device Flow Sequence

```
1. POST https://github.com/login/device/code
   body: { client_id, scope: 'repo user:email' }
   → { device_code, user_code, verification_uri, expires_in, interval }

2. Show user_code to user. Open verification_uri in system browser.

3. Poll POST https://github.com/login/oauth/access_token every `interval+1` seconds
   body: { client_id, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }
   → error: 'authorization_pending' → keep polling
   → error: 'slow_down'            → double the interval
   → error: 'expired_token'        → restart flow
   → access_token: '...'           → authenticated ✓
```

## safeStorage Token Encryption
```typescript
import { safeStorage } from 'electron'

// Encrypt before storing (returns Buffer)
const encrypted = safeStorage.encryptString(token)
settingsStore.set('settings.githubTokenEncrypted', encrypted.toString('hex'))

// Decrypt for use
const hex = settingsStore.get('settings.githubTokenEncrypted')
const token = safeStorage.decryptString(Buffer.from(hex, 'hex'))

// Always check availability
if (!safeStorage.isEncryptionAvailable()) {
  // fallback: session-only token (warn user on headless Linux without keyring)
}
```

## Renderer Polling Pattern
```tsx
// ConnectGitHubModal — setInterval polls main process each `interval+1` seconds
useEffect(() => {
  if (!deviceFlow) return
  const id = setInterval(async () => {
    const result = await pollDeviceAuth()
    if (result?.status === 'authorized') { clearInterval(id); setStep('connect-vault') }
    if (result?.status === 'slow_down')  { clearInterval(id); /* restart with 2× interval */ }
    if (result?.status === 'expired')    { clearInterval(id); showError('Code expired') }
  }, (deviceFlow.interval + 1) * 1000)
  return () => clearInterval(id)
}, [deviceFlow])
```

## OAuth App Setup (user action, one-time)
1. `github.com/settings/developers` → OAuth Apps → New OAuth App
2. Any name + homepage; callback URL can be blank (Device Flow doesn't use it)
3. Copy the **Client ID** — this is a public value, safe to store in electron-store
4. No client secret needed for Device Flow

## Reuse Notes
- `client_id` is stored in `settingsStore` (not hardcoded) so users can register their own OAuth App
- Token is stored as hex-encoded encrypted blob; never plaintext
- `AuthService.getUser()` returns `{ login, name, email, avatarUrl }` fetched after first auth
- `authService.isAuthenticated()` checks if a decryptable token exists
