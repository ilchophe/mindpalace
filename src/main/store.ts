import Store from 'electron-store'
import type { VaultRegistry, GitHubUser } from '../types'

export const registryStore = new Store<{ registry: VaultRegistry }>({
  name: 'vault-registry',
  defaults: {
    registry: { vaults: [], activeVaultId: null }
  }
})

interface AppSettings {
  githubClientId: string
  githubTokenEncrypted: string
  githubUser: GitHubUser | null
}

export const settingsStore = new Store<{ settings: AppSettings }>({
  name: 'app-settings',
  defaults: {
    settings: {
      githubClientId: '',
      githubTokenEncrypted: '',
      githubUser: null
    }
  }
})
