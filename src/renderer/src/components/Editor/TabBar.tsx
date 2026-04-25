import React from 'react'
import { useEditorStore } from '../../stores/editorStore'

export default function TabBar(): React.JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore()

  if (tabs.length === 0) {
    return <div className="h-9 border-b border-vault-border bg-vault-bg flex-shrink-0" />
  }

  return (
    <div className="flex items-stretch h-9 border-b border-vault-border bg-vault-bg overflow-x-auto flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={[
            'group flex items-center gap-1.5 px-3 h-full text-sm border-r border-vault-border',
            'max-w-[10rem] transition-colors flex-shrink-0',
            activeTabId === tab.id
              ? 'bg-vault-surface text-vault-text border-t-2 border-t-vault-accent'
              : 'text-vault-muted hover:text-vault-text hover:bg-vault-surface/50',
          ].join(' ')}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.isDirty && (
            <span className="text-vault-accent text-[10px] leading-none flex-shrink-0">●</span>
          )}
          <span className="truncate">{tab.title}</span>
          <span
            role="button"
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-auto pl-1 text-vault-muted hover:text-vault-text leading-none flex-shrink-0 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  )
}
