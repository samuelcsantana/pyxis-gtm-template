import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { noComments } from './eslint-rules/no-comments.mjs';

export default defineConfig(
  { ignores: ['coverage/'] },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { local: { rules: { 'no-comments': noComments } } },
    rules: { 'local/no-comments': 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'NewExpression',
          'ThisExpression',
          'ClassDeclaration',
          'ClassExpression',
          'TemplateLiteral',
          'TaggedTemplateExpression',
          'Literal[regex]',
          'ChainExpression',
          "LogicalExpression[operator='??']",
          'AssignmentExpression[operator=/^(\\?\\?|\\|\\||&&|\\*\\*)=$/]',
          "BinaryExpression[operator='**']",
          'SpreadElement',
          'ForOfStatement',
          'ForInStatement',
          'AwaitExpression',
          'YieldExpression',
          'ImportExpression',
        ].map((selector) => ({
          selector: `FunctionDeclaration[id.name='run'] ${selector}`,
          message:
            'Google Tag Manager runs this code as sandboxed JavaScript (ES5.1 with arrow functions, const and let): keep to that subset.',
        })),
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'globalThis', 'JSON', 'Math', 'Object', 'Array', 'String'].map(
          (name) => ({
            name,
            message:
              'Sandboxed JavaScript has no globals besides require and data: use require() for the APIs.',
          }),
        ),
      ],
    },
  },
  prettier,
);
