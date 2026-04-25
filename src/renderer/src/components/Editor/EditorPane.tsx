import React from 'react'
import { useEditorStore, type ViewMode } from '../../stores/editorStore'
import TabBar from './TabBar'
import MonacoEditor from './MonacoEditor'
import MarkdownPreview from './MarkdownPreview'
import PropertiesPanel from './PropertiesPanel'
import BacklinksPanel from '../Search/BacklinksPanel'

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'split', label: 'Split' },
  { key: 'preview', label: 'Preview' },
]

export default function EditorPane(): React.JSX.Element {
  const { tabs, activeTabId, viewMode, setViewMode } = useEditorStore()
  const hasActiveTab = activeTabId !== null && tabs.some((t) => t.id === activeTabId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TabBar />

      {hasActiveTab && (
        <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-vault-border bg-vault-bg flex-shrink-0">
          {VIEW_MODES.map(({ key, label }) => (
            <button
              key={key}
              className={[
                'px-2 py-0.5 text-xs rounded transition-colors',
                viewMode === key
                  ? 'bg-vault-accent text-vault-bg font-medium'
                  : 'text-vault-muted hover:text-vault-text',
              ].join(' ')}
              onClick={() => setViewMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {hasActiveTab ? (
          <>
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div
                className={[
                  'flex flex-col overflow-hidden',
                  viewMode === 'split' ? 'w-1/2 border-r border-vault-border' : 'w-full',
                ].join(' ')}
              >
                {/* Absolute positioning wrapper so Monaco knows its size */}
                <div className="relative flex-1 overflow-hidden">
                  <div className="absolute inset-0">
                    <MonacoEditor />
                  </div>
                </div>
              </div>
            )}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className={viewMode === 'split' ? 'w-1/2 overflow-hidden' : 'w-full overflow-hidden'}
              >
                <MarkdownPreview />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-vault-muted text-sm">
            Select a note from the sidebar to start editing
          </div>
        )}
      </div>

      {hasActiveTab && <PropertiesPanel />}
      {hasActiveTab && <BacklinksPanel />}
    </div>
  )
}
