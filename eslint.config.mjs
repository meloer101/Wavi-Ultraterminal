import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/** Files whose Chinese text has not moved into defineMessages yet; each is removed once it has. */
const I18N_PENDING = [
  'src/main/archive.ts',
  'src/main/background-image.ts',
  'src/main/background-review.ts',
  'src/main/browser/host.ts',
  'src/main/browser/index.ts',
  'src/main/confirm.ts',
  'src/main/git-graph.ts',
  'src/main/git-merge.ts',
  'src/main/git/base.ts',
  'src/main/git/run.ts',
  'src/main/github-board.ts',
  'src/main/gui/acp-driver.ts',
  'src/main/gui/acp.ts',
  'src/main/gui/catalog.ts',
  'src/main/gui/claude-driver.ts',
  'src/main/gui/claude-stream.ts',
  'src/main/gui/codex-app-server.ts',
  'src/main/gui/codex-driver.ts',
  'src/main/gui/host.ts',
  'src/main/gui/index.ts',
  'src/main/gui/launch.ts',
  'src/main/gui/pi-driver.ts',
  'src/main/gui/pi-rpc.ts',
  'src/main/hooks/normalize.ts',
  'src/main/live-rebuilds.ts',
  'src/main/pr-writer.ts',
  'src/main/pull-requests.ts',
  'src/main/remote/index.ts',
  'src/main/remote/photos.ts',
  'src/main/remote/server.ts',
  'src/main/repo-scripts.ts',
  'src/main/schedules/index.ts',
  'src/main/schedules/scheduler.ts',
  'src/main/ship.ts',
  'src/main/simulator/session.ts',
  'src/main/theme-import.ts',
  'src/main/ui.ts',
  'src/main/updates.ts',
  'src/main/worktree-create.ts',
]

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
    // I18N_STRICT=1 checks the pending files too (while moving their text).
    ignores: ['**/*.test.{ts,tsx}', ...(process.env.I18N_STRICT ? [] : I18N_PENDING)],
    rules: {
      'no-restricted-syntax': ['error', ...['Literal[raw', 'TemplateElement[value.raw', 'JSXText[value'].map((node) => ({
        selector: `${node}=/[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]/]:not(CallExpression[callee.name="defineMessages"] *)`,
        message: 'Chinese text belongs in a defineMessages({ zh, en }) table (src/shared/i18n.ts).'
      }))]
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
