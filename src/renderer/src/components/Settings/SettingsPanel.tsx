import React, { useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useSyncStore } from '../../stores/syncStore'
import { useUIStore } from '../../stores/uiStore'
import type { VaultConfig } from '@shared'

type Tab = 'appearance' | 'editor' | 'vault' | 'images' | 'sync'

const TABS: { id: Tab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Editor' },
  { id: 'vault', label: 'Vault' },
  { id: 'images', label: 'Images' },
  { id: 'sync', label: 'Sync' },
]

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <label className="text-sm text-vault-text pt-0.5 w-44 flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-vault-muted uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

// ── Tab: Appearance ──────────────────────────────────────────────────────────

function AppearanceTab(): React.JSX.Element {
  const { theme, setTheme } = useUIStore()
  return (
    <Section title="Theme">
      <Row label="Color scheme">
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={[
                'px-4 py-1.5 rounded-lg border text-sm transition-colors capitalize',
                theme === t
                  ? 'border-vault-accent text-vault-accent bg-vault-accent/10'
                  : 'border-vault-border text-vault-muted hover:border-vault-accent/60',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent color">
        <p className="text-xs text-vault-muted leading-relaxed">
          Override <code className="text-vault-accent">--vault-accent</code> in your vault&apos;s
          custom CSS file to change the accent colour.
        </p>
      </Row>
    </Section>
  )
}

// ── Tab: Editor ──────────────────────────────────────────────────────────────

function EditorTab({
  config,
  set,
}: {
  config: Partial<VaultConfig>
  set: (c: Partial<VaultConfig>) => void
}): React.JSX.Element {
  return (
    <Section title="Editor defaults">
      <Row label="Default view">
        <div className="flex gap-2">
          {(['edit', 'split', 'preview'] as const).map((v) => (
            <button
              key={v}
              onClick={() => set({ ...config, defaultEditorView: v })}
              className={[
                'px-3 py-1.5 rounded-lg border text-sm transition-colors capitalize',
                config.defaultEditorView === v
                  ? 'border-vault-accent text-vault-accent bg-vault-accent/10'
                  : 'border-vault-border text-vault-muted hover:border-vault-accent/60',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
      </Row>
    </Section>
  )
}

// ── Tab: Vault ───────────────────────────────────────────────────────────────

function VaultTab({
  config,
  set,
}: {
  config: Partial<VaultConfig>
  set: (c: Partial<VaultConfig>) => void
}): React.JSX.Element {
  return (
    <Section title="Daily notes">
      <Row label="Folder">
        <input
          type="text"
          value={config.dailyNotesFolder ?? ''}
          onChange={(e) => set({ ...config, dailyNotesFolder: e.target.value })}
          className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors"
          placeholder="Daily Notes"
        />
      </Row>
      <Row label="Template">
        <textarea
          value={config.dailyNoteTemplate ?? ''}
          onChange={(e) => set({ ...config, dailyNoteTemplate: e.target.value })}
          rows={4}
          className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors font-mono resize-none"
          placeholder={'# {{date}}\n\n'}
        />
        <p className="text-xs text-vault-muted mt-1">
          Use <code className="text-vault-accent">{'{{date}}'}</code> for today&apos;s date (YYYY-MM-DD).
        </p>
      </Row>
    </Section>
  )
}

// ── Tab: Images ──────────────────────────────────────────────────────────────

function ImagesTab({
  config,
  set,
}: {
  config: Partial<VaultConfig>
  set: (c: Partial<VaultConfig>) => void
}): React.JSX.Element {
  const mode = config.imageStorageMode ?? 'subfolder'
  return (
    <Section title="Image storage">
      <Row label="Storage mode">
        <div className="flex flex-col gap-2">
          {(
            [
              { value: 'subfolder', desc: 'Save next to note in an "images" subfolder (default)' },
              { value: 'same-folder', desc: 'Save in the same folder as the note' },
              { value: 'global', desc: 'Save in a single vault-wide folder' },
            ] as const
          ).map(({ value, desc }) => (
            <label key={value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="imageMode"
                value={value}
                checked={mode === value}
                onChange={() => set({ ...config, imageStorageMode: value })}
                className="mt-0.5 accent-[var(--vault-accent)]"
              />
              <div>
                <span className="text-sm text-vault-text capitalize">{value.replace('-', ' ')}</span>
                <p className="text-xs text-vault-muted">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Row>
      {mode === 'subfolder' && (
        <Row label="Subfolder name">
          <input
            type="text"
            value={config.imageSubfolderName ?? 'images'}
            onChange={(e) => set({ ...config, imageSubfolderName: e.target.value })}
            className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors"
            placeholder="images"
          />
        </Row>
      )}
      {mode === 'global' && (
        <Row label="Global image path">
          <input
            type="text"
            value={config.globalImagePath ?? 'assets/images'}
            onChange={(e) => set({ ...config, globalImagePath: e.target.value })}
            className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors"
            placeholder="assets/images"
          />
          <p className="text-xs text-vault-muted mt-1">Relative to vault root.</p>
        </Row>
      )}
    </Section>
  )
}

// ── Tab: Sync ────────────────────────────────────────────────────────────────

function SyncTab({
  config,
  set,
  clientId,
  setClientId,
}: {
  config: Partial<VaultConfig>
  set: (c: Partial<VaultConfig>) => void
  clientId: string
  setClientId: (v: string) => void
}): React.JSX.Element {
  return (
    <>
      <Section title="GitHub OAuth">
        <Row label="OAuth Client ID">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors font-mono"
            placeholder="Ov23lixxxxxxxxxx"
          />
          <p className="text-xs text-vault-muted mt-1">
            Register a GitHub OAuth App at github.com/settings/developers and paste the Client ID here.
          </p>
        </Row>
      </Section>
      <Section title="Auto-sync">
        <Row label="Sync on save">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.syncOnSave ?? false}
              onChange={(e) => set({ ...config, syncOnSave: e.target.checked })}
              className="accent-[var(--vault-accent)]"
            />
            <span className="text-sm text-vault-muted">Commit and push 30 s after saving</span>
          </label>
        </Row>
        <Row label="Sync interval (min)">
          <input
            type="number"
            min={0}
            max={60}
            value={config.syncIntervalMinutes ?? 0}
            onChange={(e) =>
              set({ ...config, syncIntervalMinutes: Math.max(0, parseInt(e.target.value) || 0) })
            }
            className="w-24 bg-vault-bg border border-vault-border rounded-lg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent transition-colors"
          />
          <p className="text-xs text-vault-muted mt-1">Set to 0 to disable interval sync.</p>
        </Row>
      </Section>
    </>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function SettingsPanel(): React.JSX.Element {
  const { closeSettings } = useUIStore()
  const { activeConfig, loadRegistry } = useVaultStore()
  const { authStatus, setClientId: saveClientId } = useSyncStore()

  const [tab, setTab] = useState<Tab>('appearance')
  const [config, setConfig] = useState<Partial<VaultConfig>>(activeConfig ?? {})
  const [clientId, setClientId] = useState(authStatus?.clientId ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (activeConfig) setConfig(activeConfig)
  }, [activeConfig])

  async function save(): Promise<void> {
    setSaving(true)
    try {
      if (activeConfig) await window.api.vault.updateConfig(config)
      if (clientId !== (authStatus?.clientId ?? '')) await saveClientId(clientId)
      await loadRegistry()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={closeSettings}
    >
      <div
        className="w-[680px] max-h-[82vh] bg-vault-surface border border-vault-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
          <h2 className="text-base font-semibold text-vault-text">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-vault-muted hover:text-vault-text text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Side nav */}
          <nav className="w-40 border-r border-vault-border flex flex-col gap-0.5 p-2 flex-shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={[
                  'text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  tab === t.id
                    ? 'bg-vault-accent/10 text-vault-accent font-medium'
                    : 'text-vault-muted hover:text-vault-text hover:bg-vault-border/40',
                ].join(' ')}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {!activeConfig && tab !== 'appearance' && tab !== 'sync' && (
              <p className="text-sm text-vault-muted">Open a vault to configure these settings.</p>
            )}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'editor' && activeConfig && (
              <EditorTab config={config} set={setConfig} />
            )}
            {tab === 'vault' && activeConfig && (
              <VaultTab config={config} set={setConfig} />
            )}
            {tab === 'images' && activeConfig && (
              <ImagesTab config={config} set={setConfig} />
            )}
            {tab === 'sync' && (
              <SyncTab
                config={config}
                set={setConfig}
                clientId={clientId}
                setClientId={setClientId}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-vault-border flex-shrink-0">
          {saved && <span className="text-xs text-green-400">Saved</span>}
          <button onClick={closeSettings} className="btn-secondary text-sm">
            Close
          </button>
          {(activeConfig || tab === 'sync') && (
            <button onClick={save} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
