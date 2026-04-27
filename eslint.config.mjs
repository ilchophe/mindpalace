import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
})

export default [
  {
    ignores: ['node_modules/**', 'out/**', 'dist-electron/**', '.eslintrc.cjs']
  },
  ...compat.extends(
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ),
  ...compat.plugins('react-hooks'),
  ...compat.extends('plugin:react-hooks/recommended'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
]
