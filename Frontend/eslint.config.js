import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Texto visible sin pasar por t(): marcas, siglas y símbolos que no se traducen.
const I18N_ALLOW = new Set(['OT', 'OT CRM', 'VISA', 'MC', 'QR', 'ARS', 'VIP', 'Tab', 'Esc', 'Score', 'LEADS', 'Admin',
  'WhatsApp', 'Telegram', 'Google Contacts', 'GitHub', 'LinkedIn', 'Free', 'Pro', 'Business', 'Enterprise', 'pts',
  'CRM', 'OT CRM.', 'Pexels', 'ID:', 'min', '% msgs', 'Plan'])

// Regla local: avisa cuando un texto con letras queda escrito directo en el JSX
// (o en placeholder/title/aria-label/alt) en lugar de usar t('clave'). Ver UX-27.
const i18nPlugin = {
  rules: {
    'no-literal-text': {
      meta: { type: 'suggestion', messages: { literal: 'Texto sin traducir: "{{text}}". Usá t(\'clave\') (i18n/translations.js).' } },
      create(context) {
        const check = (node, raw) => {
          const text = raw.replace(/\s+/g, ' ').trim()
          if (!/\p{L}{2,}/u.test(text) || I18N_ALLOW.has(text)) return
          context.report({ node, messageId: 'literal', data: { text: text.slice(0, 40) } })
        }
        return {
          JSXText(node) { check(node, node.value) },
          JSXAttribute(node) {
            const name = node.name && node.name.name
            if (!['placeholder', 'title', 'aria-label', 'alt'].includes(name)) return
            if (node.value && node.value.type === 'Literal' && typeof node.value.value === 'string') check(node, node.value.value)
          },
        }
      },
    },
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { i18n: i18nPlugin },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // warn (no error): señala lo pendiente sin romper el lint de CI
      'i18n/no-literal-text': 'warn',
    },
  },
  // Componentes de prueba/infraestructura sin texto de producto
  { files: ['src/components/ui/**', 'src/components/landing/LineIcon.jsx'], rules: { 'i18n/no-literal-text': 'off' } },
])
