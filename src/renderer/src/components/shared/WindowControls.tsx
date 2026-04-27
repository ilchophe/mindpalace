import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

const isMac = window.platform === 'darwin'

/**
 * Frameless-window title-bar controls (Minimize / Maximize / Close).
 * Hidden on macOS (native traffic lights are used there).
 * Rendered inside an app-no-drag span so clicks aren't swallowed by the drag region.
 */
export default function WindowControls(): React.JSX.Element | null {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.windowApi.isMaximized().then(setMaximized)
    const unsub = window.windowApi.onMaximizeChange(setMaximized)
    return unsub
  }, [])

  if (isMac) return null

  return (
    <div className="flex items-stretch flex-shrink-0 app-no-drag">
      <button
        title="Minimize"
        className="h-full px-3.5 text-vault-muted hover:text-vault-text hover:bg-vault-surface/70 transition-colors flex items-center"
        onClick={() => window.windowApi.minimize()}
      >
        <Minus size={13} />
      </button>
      <button
        title={maximized ? 'Restore' : 'Maximize'}
        className="h-full px-3.5 text-vault-muted hover:text-vault-text hover:bg-vault-surface/70 transition-colors flex items-center"
        onClick={() => window.windowApi.maximize()}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button
        title="Close"
        className="h-full px-3.5 text-vault-muted hover:text-white hover:bg-red-600 transition-colors flex items-center"
        onClick={() => window.windowApi.close()}
      >
        <X size={13} />
      </button>
    </div>
  )
}
