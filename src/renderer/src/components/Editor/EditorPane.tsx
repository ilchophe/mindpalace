import React from 'react'
import { useEditorStore, type ViewMode } from '../../stores/editorStore'
import TabBar from './TabBar'
import CodeMirrorEditor from './CodeMirrorEditor'
import MarkdownPreview from './MarkdownPreview'
import PropertiesPanel from './PropertiesPanel'
import BacklinksPanel from '../Search/BacklinksPanel'

const VIEW_MODES: { key: ViewMode; icon: string; title: string }[] = [
  { key: 'edit', icon: '✎', title: 'Live preview' },
  { key: 'split', icon: '⬜⬜', title: 'Split view' },
  { key: 'preview', icon: '👁', title: 'Reading view' }
]

function Breadcrumb({ relativePath }: { relativePath: string }): React.JSX.Element {
  const parts = relativePath.replace(/\.md$/, '').split('/')
  return (
    <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-vault-muted/40 mx-0.5 flex-shrink-0">/</span>}
          <span
            className={[
              'truncate',
              i === parts.length - 1 ? 'text-vault-text font-medium' : 'text-vault-muted'
            ].join(' ')}
          >
            {part}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

export default function EditorPane(): React.JSX.Element {
  const { tabs, activeTabId, viewMode, setViewMode } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const hasActiveTab = activeTab !== null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TabBar />

      {hasActiveTab && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vault-border bg-vault-bg flex-shrink-0">
          {/* Breadcrumb — takes all remaining space */}
          <div className="flex-1 min-w-0 text-xs">
            <Breadcrumb relativePath={activeTab.relativePath} />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {VIEW_MODES.map(({ key, icon, title }) => (
              <button
                key={key}
                title={title}
                className={[
                  'px-2 py-0.5 text-xs rounded transition-colors',
                  viewMode === key
                    ? 'bg-vault-accent/20 text-vault-accent'
                    : 'text-vault-muted hover:text-vault-text hover:bg-vault-border/40'
                ].join(' ')}
                onClick={() => setViewMode(key)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {hasActiveTab ? (
          <>
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div
                className={[
                  'flex flex-col overflow-hidden',
                  viewMode === 'split' ? 'w-1/2 border-r border-vault-border' : 'w-full'
                ].join(' ')}
              >
                <div className="relative flex-1 overflow-hidden">
                  <div className="absolute inset-0">
                    <CodeMirrorEditor />
                  </div>
                </div>
              </div>
            )}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className={
                  viewMode === 'split' ? 'w-1/2 overflow-hidden' : 'w-full overflow-hidden'
                }
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
