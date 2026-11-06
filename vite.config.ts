// Vite+ (vp): one config for the whole workspace. Lint (Oxlint, type-aware, with the type check),
// format (Oxfmt), `vp check` and the tests (Vitest) read it from here, at the root, for every
// package; each package builds itself with `vp pack` from its own vite.config.ts.
//
//     pnpm exec vp check        # format, lint and type-check, as CI does
//     pnpm exec vp check --fix  # the same, fixing what can be fixed
//     pnpm exec vp test run     # every package's tests
import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    tabWidth: 2,
    semi: false,
    singleQuote: true,
    printWidth: 120,
    trailingComma: 'all',
    // TypeScript and JSON only: Markdown and YAML stay as written, and the lockfile is generated.
    ignorePatterns: ['**/dist/**', '**/*.md', '**/*.yaml', '**/*.yml', 'pnpm-lock.yaml'],
  },
  lint: {
    ignorePatterns: ['**/dist/**'],
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'node'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      // `_name` marks a value left unused on purpose (a destructured key dropped, a parameter kept for its position).
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
    overrides: [
      {
        // Tests reach into what they check: casts and non-null assertions are fine there.
        files: ['**/*.test.ts'],
        rules: {
          'typescript/no-non-null-assertion': 'off',
          'typescript/no-explicit-any': 'off',
        },
      },
      {
        // openapi-client-gen's output, as it writes it: oas-truth counts a string's length in code
        // points (`[...data].length`), as JSON Schema's `minLength` does.
        files: ['packages/openapi-client-gen/src/fixtures/*.ts'],
        rules: {
          'typescript/no-misused-spread': 'off',
        },
      },
    ],
  },
  test: {
    // types.test.ts files hold only type-level assertions (`@ts-expect-error`): the type check of
    // `vp check` runs them, Vitest has nothing to run in them.
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/types.test.ts'],
  },
  staged: {
    '*.{ts,js,json}': 'vp check --fix',
  },
})
