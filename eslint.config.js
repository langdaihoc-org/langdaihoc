import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** Baseline ESLint — catch clear bugs without blocking the monorepo on style nits. */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.vercel/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/database/drizzle/**',
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Baseline: keep existing sync-from-props patterns; tighten later in Phase 3+.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-namespace': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
      'no-irregular-whitespace': 'warn',
    },
  },
);
