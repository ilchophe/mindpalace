import React, { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  separator?: boolean
  onClick?: () => void
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp so menu doesn't overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 280),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 9999,
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[180px] rounded-md border border-vault-border bg-vault-surface shadow-xl py-1 text-sm"
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-vault-border/60" />
        }
        return (
          <button
            key={i}
            className={[
              'flex items-center gap-2.5 w-full text-left px-3 py-1.5 transition-colors',
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-vault-text hover:bg-vault-border/50',
            ].join(' ')}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {item.icon && <span className="text-base w-4 text-center">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
