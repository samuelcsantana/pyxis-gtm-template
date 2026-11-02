import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noComments } from './no-comments.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const comment = { messageId: 'comment' };

ruleTester.run('no-comments', noComments, {
  valid: [
    { name: 'code without comments', code: 'const answer: number = 42;' },
    { name: 'a shebang line', code: '#!/usr/bin/env node\nconst answer = 42;' },
    { name: 'comment-like text inside a string', code: "const url = 'https://example.com/#a';" },
  ],
  invalid: [
    { name: 'a line comment', code: '// explain\nconst a = 1;', errors: [comment] },
    { name: 'a trailing comment', code: 'const a = 1; // explain', errors: [comment] },
    { name: 'a block comment', code: '/* explain */\nconst a = 1;', errors: [comment] },
    { name: 'a JSDoc block', code: '/** Adds. */\nfunction add() {}', errors: [comment] },
    {
      name: 'an eslint-disable directive',
      code: '// eslint-disable-next-line no-console\nconsole.log(1);',
      errors: [comment],
    },
    {
      name: 'a ts-expect-error directive',
      code: '// @ts-expect-error\nconst a: string = 1;',
      errors: [comment],
    },
    {
      name: 'a triple-slash reference',
      code: '/// <reference types="node" />\nconst a = 1;',
      errors: [comment],
    },
    {
      name: 'every comment in a file',
      code: '#!/usr/bin/env node\n// one\nconst a = 1; /* two */',
      errors: [comment, comment],
    },
  ],
});
