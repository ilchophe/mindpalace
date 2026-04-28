import { registryStore } from '../store'
import type { VaultRegistry, VaultSummary } from '../../types'

class VaultRegistryService {
  getAll(): VaultSummary[] {
    return this.get().vaults
  }

  getById(id: string): VaultSummary | undefined {
    return this.get().vaults.find((v) => v.id === id)
  }

  getByPath(localPath: string): VaultSummary | undefined {
    return this.get().vaults.find((v) => v.localPath === localPath)
  }

  getActive(): VaultSummary | null {
    const { vaults, activeVaultId } = this.get()
    return vaults.find((v) => v.id === activeVaultId) ?? null
  }

  setActive(id: string | null): void {
    registryStore.set('registry.activeVaultId', id)
  }

  add(summary: VaultSummary): void {
    const vaults = this.get().vaults
    registryStore.set('registry.vaults', [...vaults, summary])
  }

  update(id: string, changes: Partial<VaultSummary>): void {
    const vaults = this.get().vaults.map((v) => (v.id === id ? { ...v, ...changes } : v))
    registryStore.set('registry.vaults', vaults)
  }

  remove(id: string): void {
    const reg = this.get()
    registryStore.set(
      'registry.vaults',
      reg.vaults.filter((v) => v.id !== id)
    )
    if (reg.activeVaultId === id) {
      registryStore.set('registry.activeVaultId', null)
    }
  }

  private get(): VaultRegistry {
    return registryStore.get('registry')
  }
}

export const vaultRegistry = new VaultRegistryService()
