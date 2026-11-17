import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['.claude/', 'out/', 'dist/', 'release/', 'node_modules/', 'coverage/', 'test-results/', 'site/dist/', 'site/.astro/',
      // Launch films: HyperFrames compositions rendered to video (browser scripts, vendored libraries), not app code.
      'launch-videos/',
      // iPhone app (PRD F22): Swift, tested with `xcodebuild test` inside ios/ (its build folder holds package sources).
      'ios/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**', 'src/preload/**', 'src/pty-host/**', 'e2e/**', 'e2e-packaged/**', 'scripts/*.mjs', 'scripts/readme-shots/*.mjs', '*.config.*', 'site/*.config.*'],
    languageOptions: { globals: globals.node }
  },
  {
    // Build-time CommonJS helpers (electron-builder hooks, icon rendering).
    files: ['build/**/*.cjs', 'scripts/**/*.cjs', '.dependency-cruiser.cjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  {
    // Website (Astro; browser scripts in site/src/scripts).
    files: ['site/**'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    // Interface language (Figma 89): Chinese in app code only inside defineMessages({ zh, en }) (shared/i18n.ts), so
    // every string has its English twin. Tests may assert either language.
    files: ['src/main/**/*.{ts,tsx}', 'src/renderer/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...['Literal[raw', 'TemplateElement[value.raw', 'JSXText[value'].map((node) => ({
        selector: `${node}=/[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]/]:not(CallExpression[callee.name="defineMessages"] *)`,
        message: 'Chinese text belongs in a defineMessages({ zh, en }) table (src/shared/i18n.ts).'
      }))]
    }
  },
  {
    // Icons (CLAUDE.md, PRD v1.204): a glyph is chosen only in src/renderer/ui/glyphs.ts and drawn only by ui/icons.tsx;
    // the iPhone app's generator reads glyphs.ts too.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/renderer/ui/glyphs.ts', 'src/renderer/ui/icons.tsx', 'src/main/remote/phone-assets.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@hugeicons/*', 'lucide-react'], message: 'Icons come from src/renderer/ui/icons.tsx; choose a new glyph in ui/glyphs.ts.' }] }]
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
