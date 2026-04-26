import React from 'react'
import { Pencil, Columns2, BookOpen, type LucideIcon } from 'lucide-react'
import { useEditorStore, type ViewMode } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import TabBar from './TabBar'
import CodeMirrorEditor from './CodeMirrorEditor'
import MarkdownPreview from './MarkdownPreview'
import PropertiesPanel from './PropertiesPanel'
import BacklinksPanel from '../Search/BacklinksPanel'

const VIEW_MODES: { key: ViewMode; Icon: LucideIcon; title: string }[] = [
  { key: 'edit',    Icon: Pencil,   title: 'Live preview' },
  { key: 'split',   Icon: Columns2, title: 'Split view' },
  { key: 'preview', Icon: BookOpen, title: 'Reading view' }
]

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])

function getExt(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

function toVaultFileUrl(vaultPath: string, relPath: string): string {
  const parts = [...vaultPath.replace(/\\/g, '/').split('/'), ...relPath.split('/')]
  const resolved: string[] = []
  for (const seg of parts) {
    if (seg === '..') resolved.pop()
    else if (seg && seg !== '.') resolved.push(seg)
  }
  return `vault-file:///${encodeURI(resolved.join('/'))}`
}

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

function ImageViewer({ vaultPath, relativePath }: { vaultPath: string; relativePath: string }): React.JSX.Element {
  const url = toVaultFileUrl(vaultPath, relativePath)
  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-vault-bg">
      <img
        src={url}
        alt={relativePath.split('/').pop() ?? relativePath}
        className="max-w-full max-h-full object-contain rounded shadow-lg"
        draggable={false}
      />
    </div>
  )
}

export default function EditorPane(): React.JSX.Element {
  const { tabs, activeTabId, viewMode, setViewMode } = useEditorStore()
  const { activeConfig } = useVaultStore()
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const hasActiveTab = activeTab !== null
  const isImageTab = activeTab?.isAsset && IMAGE_EXTS.has(getExt(activeTab.relativePath))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TabBar />

      {hasActiveTab && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vault-border bg-vault-bg flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex-1 min-w-0 text-xs">
            <Breadcrumb relativePath={activeTab.relativePath} />
          </div>

          {/* View mode toggle — hidden for image/asset tabs */}
          {!activeTab.isAsset && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {VIEW_MODES.map(({ key, Icon, title }) => (
                <button
                  key={key}
                  title={title}
                  className={[
                    'p-1.5 rounded transition-colors',
                    viewMode === key
                      ? 'bg-vault-accent/20 text-vault-accent'
                      : 'text-vault-muted hover:text-vault-text hover:bg-vault-border/40'
                  ].join(' ')}
                  onClick={() => setViewMode(key)}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {hasActiveTab ? (
          isImageTab ? (
            <ImageViewer
              vaultPath={activeConfig?.localPath ?? ''}
              relativePath={activeTab.relativePath}
            />
          ) : (
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
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-vault-muted text-sm">
            Select a note from the sidebar to start editing
          </div>
        )}
      </div>

      {hasActiveTab && !activeTab.isAsset && <PropertiesPanel />}
      {hasActiveTab && !activeTab.isAsset && <BacklinksPanel />}
    </div>
  )
}
