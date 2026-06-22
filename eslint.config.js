import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import globals from 'globals';

// Single flat config for the whole Bun monorepo:
//   - apps/api + packages/shared + scripts  → TypeScript on Bun/Node
//   - apps/dashboard                        → Vue 3 SFCs in the browser
// Formatting is owned by Prettier; `skipFormatting` disables every ESLint
// rule that would fight it, so ESLint only enforces correctness/quality.
export default defineConfigWithVueTs(
  {
    name: 'wavi/ignores',
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'apps/dashboard/dist/**', 'apps/dashboard/src/components/HelloWorld.vue'],
  },

  {
    name: 'wavi/files',
    files: ['**/*.{ts,mts,cts,tsx,mjs,vue}'],
  },

  // Non-type-checked recommended rules keep linting fast (no project service).
  vueTsConfigs.recommended,

  // Vue SFC rules only apply to .vue files (scoped by the plugin itself).
  pluginVue.configs['flat/recommended'],

  {
    name: 'wavi/dashboard',
    files: ['apps/dashboard/**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  {
    name: 'wavi/server',
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: { ...globals.node, Bun: 'readonly' },
    },
  },

  {
    name: 'wavi/rules',
    rules: {
      // Allow intentionally-unused args/vars when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` shows up in third-party WA/puppeteer surfaces; warn, don't block.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },

  {
    name: 'wavi/vue-overrides',
    files: ['**/*.vue'],
    rules: {
      // Single-word presentational components (Skeleton, etc.) are intentional.
      'vue/multi-word-component-names': 'off',
    },
  },

  // Must come last: turns off ESLint rules that overlap with Prettier.
  skipFormatting,
);
