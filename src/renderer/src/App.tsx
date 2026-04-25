import React, { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import MainLayout from './components/Layout/MainLayout'

export default function App(): React.JSX.Element {
  const { loadRegistry, openManager } = useVaultStore()

  useEffect(() => {
    loadRegistry().then(() => {
      // If no vault is active after loading, open the manager so the user can choose/create one.
      const { activeVault } = useVaultStore.getState()
      if (!activeVault) openManager()
    })

    // Re-load registry whenever main process signals a registry change
    const off = window.api.vault.onRegistryChanged(() => loadRegistry())
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <MainLayout />
}
