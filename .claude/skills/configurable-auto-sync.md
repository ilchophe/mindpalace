# skill: configurable-auto-sync

## Purpose
Allow users to choose how often MindPalace automatically commits and pushes
changes to GitHub — from every 5 minutes up to never. The interval is stored
in `VaultConfig`, surfaced in the Settings panel, and drives a `setInterval`
timer inside `SyncService` in the main process.

---

## Key Files

| File | Role |
|---|---|
| `src/types/index.ts` | `VaultConfig.syncIntervalMinutes` field (0 = disabled) |
| `src/main/services/SyncService.ts` | `startAutoSync` / `stopAutoSync` / `restartAutoSync` using `setInterval` |
| `src/main/ipc/git.ts` | `git:setSyncInterval` handler that persists the new value and restarts the timer |
| `src/renderer/src/components/Settings/SettingsPanel.tsx` | "Auto-sync interval" dropdown (Never / 5 min / 15 min / 30 min / 1 hour) |
| `src/renderer/src/stores/syncStore.ts` | `syncIntervalMinutes` state + `setSyncInterval` action |

---

## VaultConfig field

```typescript
// src/types/index.ts
interface VaultConfig {
  // ...existing fields...
  syncIntervalMinutes: number   // 0 = disabled; 5 | 15 | 30 | 60 = timed auto-sync
}
```

Default: `5` (auto-sync every 5 minutes when a GitHub repo is connected).

---

## SyncService timer pattern

```typescript
// src/main/services/SyncService.ts
export class SyncService {
  private autoSyncTimer: NodeJS.Timeout | null = null

  startAutoSync(config: VaultConfig): void {
    this.stopAutoSync()
    if (!config.githubRepo || config.syncIntervalMinutes <= 0) return
    const ms = config.syncIntervalMinutes * 60_000
    this.autoSyncTimer = setInterval(() => this.syncNow(config), ms)
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer)
      this.autoSyncTimer = null
    }
  }

  restartAutoSync(config: VaultConfig): void {
    this.stopAutoSync()
    this.startAutoSync(config)
  }
}
```

Call `startAutoSync` in `VaultService.open()` and `stopAutoSync` in
`VaultService.close()`. Call `restartAutoSync` after the user changes the
interval so the new cadence takes effect immediately without an app restart.

---

## IPC handler

```typescript
// src/main/ipc/git.ts  (inside registerGitHandlers)
ipcMain.handle('git:setSyncInterval', async (_e, minutes: number) => {
  const config = vaultService.getActiveConfig()
  if (!config) throw new Error('No active vault')
  const updated = await vaultService.updateConfig({ syncIntervalMinutes: minutes })
  syncService.restartAutoSync(updated)
  return updated
})
```

Add to `IPC.GIT`:
```typescript
SET_SYNC_INTERVAL: 'git:setSyncInterval'
```

Add to preload + `env.d.ts`:
```typescript
git: {
  // ...existing...
  setSyncInterval: (minutes: number) => Promise<VaultConfig>
}
```

---

## Settings UI — interval picker

```tsx
// Inside SettingsPanel, GitHub/Sync tab
const INTERVALS = [
  { label: 'Never',    value: 0  },
  { label: '5 min',   value: 5  },
  { label: '15 min',  value: 15 },
  { label: '30 min',  value: 30 },
  { label: '1 hour',  value: 60 },
]

function SyncIntervalPicker() {
  const [interval, setInterval] = useState(config.syncIntervalMinutes)

  async function handleChange(minutes: number) {
    setInterval(minutes)
    await window.api.git.setSyncInterval(minutes)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-vault-muted">Auto-sync interval</label>
      <select
        value={interval}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="rounded border border-vault-border bg-vault-surface px-2 py-1 text-sm text-vault-text"
      >
        {INTERVALS.map(({ label, value }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  )
}
```

Display the current countdown in `SyncPanel`:
```tsx
// Show "next sync in Xm" when interval > 0 and status is idle
{isConnected && config.syncIntervalMinutes > 0 && (
  <span className="text-[10px] text-vault-muted">
    every {config.syncIntervalMinutes}m
  </span>
)}
```

---

## Sync-on-save vs interval sync

| Trigger | Mechanism | Default |
|---|---|---|
| **On save** | `syncService.scheduleSyncAfterSave()` — debounced 30 s after last write | Controlled by `VaultConfig.syncOnSave` |
| **Interval** | `setInterval` in SyncService | `syncIntervalMinutes = 5` |
| **Manual** | User clicks "Sync now" in SyncPanel | Always available |

All three paths call `syncService.syncNow()` which is idempotent (skips if
already syncing).

---

## Migration / defaults

When opening an existing vault whose config pre-dates this field, default to
`syncIntervalMinutes: 5` so sync is always on unless the user turns it off:

```typescript
// VaultService.open() — after reading stored config
config.syncIntervalMinutes ??= 5
```

---

## Reuse Notes
- `clearInterval` is safe to call with `null` — no need to guard it
- Keep the timer reference on the service instance, not in electron-store
- The renderer's `syncStore` only needs to know the current value to render the
  picker; the authoritative value lives in `VaultConfig` in the main process
- Test by setting interval to 1 min and verifying a commit appears in `git log`
  after 60 s with no manual save
