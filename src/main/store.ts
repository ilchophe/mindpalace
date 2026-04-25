import Store from 'electron-store'
import type { VaultRegistry } from '../types'

export const registryStore = new Store<{ registry: VaultRegistry }>({
  name: 'vault-registry',
  defaults: {
    registry: { vaults: [], activeVaultId: null }
  }
})
