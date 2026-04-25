import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx,html}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace']
      },
      colors: {
        vault: {
          bg: 'var(--vault-bg)',
          surface: 'var(--vault-surface)',
          border: 'var(--vault-border)',
          text: 'var(--vault-text)',
          muted: 'var(--vault-muted)',
          accent: 'var(--vault-accent)'
        }
      }
    }
  },
  plugins: []
}

export default config
