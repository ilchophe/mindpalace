import React from 'react'

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen bg-vault-bg text-vault-text">
      <div className="flex flex-col items-center justify-center w-full gap-4">
        <h1 className="text-4xl font-bold tracking-tight">MindPalace</h1>
        <p className="text-vault-muted text-lg">Phase 0 scaffold — ready to build.</p>
      </div>
    </div>
  )
}
