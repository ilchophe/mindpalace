import React, { useEffect, useRef, useState } from 'react'
import { X, ChevronDown, FileText, Minus, Square, Copy } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const isMac = window.platform === 'darwin'

function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.windowApi.isMaximized().then(setMaximized)
    const unsub = window.windowApi.onMaximizeChange(setMaximized)
    return unsub
  }, [])

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
        {maximized ? <Copy size={12} className="rotate-0" /> : <Square size={12} />}
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

export default function TabBar(): React.JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore()
  const stripRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // Detect when tabs overflow the container
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const check = (): void => setHasOverflow(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs])

  // Scroll the active tab into view whenever it changes
  useEffect(() => {
    if (!stripRef.current) return
    const active = stripRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTabId])

  // The outer container is the drag region — interactive children opt out
  return (
    <div className="app-drag relative flex items-stretch h-9 border-b border-vault-border bg-vault-bg flex-shrink-0">
      {/* Tab strip — overflow hidden so tabs never wrap or scroll */}
      <div ref={stripRef} className="flex items-stretch overflow-hidden flex-1 app-no-drag">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-active={tab.id === activeTabId ? 'true' : 'false'}
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
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-auto pl-1 flex items-center text-vault-muted hover:text-vault-text flex-shrink-0 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>

      {/* Overflow dropdown — only shown when tabs overflow */}
      {hasOverflow && (
        <div className="relative flex-shrink-0 app-no-drag">
          <button
            title="All open tabs"
            className="h-full px-2 border-l border-vault-border text-vault-muted hover:text-vault-text hover:bg-vault-surface/50 flex items-center transition-colors"
            onClick={() => setShowDropdown((d) => !d)}
          >
            <ChevronDown
              size={14}
              className={showDropdown ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full z-50 w-64 bg-vault-surface border border-vault-border rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-1.5 border-b border-vault-border">
                  <span className="text-[10px] font-semibold text-vault-muted uppercase tracking-wider">
                    Open tabs ({tabs.length})
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={[
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                        tab.id === activeTabId
                          ? 'bg-vault-accent/10 text-vault-accent'
                          : 'text-vault-text hover:bg-vault-border/30',
                      ].join(' ')}
                      onClick={() => {
                        setActiveTab(tab.id)
                        setShowDropdown(false)
                      }}
                    >
                      <FileText size={13} className="flex-shrink-0 text-vault-muted/60" />
                      {tab.isDirty && (
                        <span className="text-vault-accent text-[10px] leading-none flex-shrink-0">●</span>
                      )}
                      <span className="truncate flex-1">{tab.title}</span>
                      <span
                        role="button"
                        className="opacity-60 hover:!opacity-100 flex-shrink-0 text-vault-muted hover:text-red-400 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.id)
                          if (tabs.length <= 1) setShowDropdown(false)
                        }}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Spacer that acts as drag region when no tabs fill the bar */}
      <div className="flex-1 min-w-[1rem]" />

      {/* Window controls — right side, only on Windows / Linux */}
      {!isMac && <WindowControls />}
    </div>
  )
}
