# skill: vault-manager-ui

## Purpose
Full-screen Vault Manager overlay in React. Lists all vaults as cards, supports filter/sort/label, switches vaults, and implements a two-step deletion flow with typed confirmation.

## Key Components
| Component | File |
|---|---|
| `VaultManagerScreen` | `src/renderer/src/components/VaultManager/VaultManagerScreen.tsx` |
| `VaultCard` | `src/renderer/src/components/VaultManager/VaultCard.tsx` |
| `DeleteVaultModal` | `src/renderer/src/components/VaultManager/DeleteVaultModal.tsx` |
| `vaultStore` | `src/renderer/src/stores/vaultStore.ts` |

## Core Pattern

### Opening the manager
```tsx
// From anywhere
const { openManager } = useVaultStore()
openManager()   // sets isManagerOpen = true

// Keyboard shortcut in MainLayout
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'V') openManager()
})
```

### Vault switch
```tsx
const { switchVault } = useVaultStore()
await switchVault(vault.id)
// → calls vault:switch IPC, reloads registry, clears notes/selectedNote
```

### Two-step deletion
```tsx
// Step 1: typed confirmation (case-sensitive)
typed === vault.name    // enables "Delete vault →" button

// Step 2: 3-second hold-to-confirm (fills progress bar at 100ms intervals)
// Only fires handleDelete() when holdProgress >= 100

// IPC call (main also re-validates confirmation)
await window.api.vault.delete({ vaultId, confirmation: vault.name, deleteRemote })
```

### Label filtering (derived state, no extra store slice)
```typescript
const filtered = useMemo(() => {
  let list = vaults
  if (filter) list = list.filter(v => v.name.includes(filter) || v.labels.some(...))
  if (activeLabel) list = list.filter(v => v.labels.includes(activeLabel))
  return sortVaults(list, sortKey)
}, [vaults, filter, sortKey, activeLabel])
```

## Vault card sync status badges
```typescript
const STATUS_BADGE = {
  idle:         { label: '● synced',    cls: 'text-green-400' },
  conflict:     { label: '⚠ conflict',  cls: 'text-yellow-400' },
  disconnected: { label: '○ local only', cls: 'text-vault-muted' },
  // …
}
```

## Reuse Notes
- `VaultManagerScreen` renders as a `fixed inset-0 z-40` overlay — no router needed
- `DeleteVaultModal` renders as `fixed inset-0 z-50` on top of VaultManagerScreen
- Hold-to-confirm uses `setInterval` at 100ms; cleanup with `clearInterval` in `useEffect` return
- `window.api.vault.pickFolder()` triggers native folder dialog (main process `dialog.showOpenDialog`)
- Context menu inside `VaultCard` closes on `mousedown` outside via `useEffect` document listener
