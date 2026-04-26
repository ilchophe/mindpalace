import React, { useEffect, useRef } from 'react'
import {
  FileText,
  FolderPlus,
  Pencil,
  Copy,
  FolderOpen,
  Trash2,
  type LucideIcon
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'file-text':   FileText,
  'folder-plus': FolderPlus,
  'pencil':      Pencil,
  'copy':        Copy,
  'folder-open': FolderOpen,
  'trash':       Trash2,
}

export interface ContextMenuItem {
  label: string
  /** Lucide icon key (see ICON_MAP) */
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
      className="min-w-[190px] rounded-lg border border-vault-border bg-vault-surface shadow-2xl py-1 text-sm"
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-vault-border/50" />
        }
        const IconComp = item.icon ? ICON_MAP[item.icon] : undefined
        return (
          <button
            key={i}
            className={[
              'flex items-center gap-2.5 w-full text-left px-3 py-[5px] transition-colors',
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-vault-text hover:bg-vault-border/50',
            ].join(' ')}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {IconComp
              ? <IconComp size={14} className={item.danger ? 'text-red-400' : 'text-vault-muted'} />
              : <span className="w-[14px]" />
            }
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
