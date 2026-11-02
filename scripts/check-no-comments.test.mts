import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findCommentLines, syntaxOf } from './check-no-comments.mts';

describe('syntaxOf', () => {
  it('recognizes each checked family', () => {
    assert.equal(syntaxOf('.github/workflows/ci.yml'), 'yaml');
    assert.equal(syntaxOf('src/tests.yaml'), 'yaml');
    assert.equal(syntaxOf('scripts/deploy-lambda.sh'), 'hash');
    assert.equal(syntaxOf('Dockerfile.lambda'), 'hash');
    assert.equal(syntaxOf('.husky/pre-commit'), 'hash');
    assert.equal(syntaxOf('.gitignore'), 'hash');
    assert.equal(syntaxOf('infra/lambda.tf'), 'terraform');
    assert.equal(syntaxOf('infra/prod.tfvars'), 'terraform');
    assert.equal(syntaxOf('sql/grants.sql'), 'sql');
    assert.equal(syntaxOf('tsconfig.build.json'), 'jsonc');
    assert.equal(syntaxOf('.vscode/settings.json'), 'jsonc');
    assert.equal(syntaxOf('config.jsonc'), 'jsonc');
  });

  it('skips generated files and files ESLint or nobody checks', () => {
    assert.equal(syntaxOf('drizzle/0000_init.sql'), undefined);
    assert.equal(syntaxOf('.husky/_/husky.sh'), undefined);
    assert.equal(syntaxOf('README.md'), undefined);
    assert.equal(syntaxOf('package.json'), undefined);
    assert.equal(syntaxOf('src/main.ts'), undefined);
  });

  it('accepts Windows separators', () => {
    assert.equal(syntaxOf('.github\\workflows\\ci.yml'), 'yaml');
    assert.equal(syntaxOf('drizzle\\0000_init.sql'), undefined);
  });
});

describe('findCommentLines', () => {
  it('reports full-line comments with their 1-based line numbers', () => {
    assert.deepEqual(
      findCommentLines('ci.yml', 'name: CI\n# note\non: push\n  # indented'),
      [2, 4],
    );
  });

  it('reports a trailing hash comment', () => {
    assert.deepEqual(findCommentLines('ci.yml', 'runs-on: ubuntu-latest # note'), [1]);
  });

  it('ignores a hash inside quotes or without whitespace before it', () => {
    const yaml = [
      "color: '#F5B83D'",
      'label: "issue #1"',
      'url: https://github.com/a/b#readme',
      'count: ${#items}',
    ].join('\n');
    assert.deepEqual(findCommentLines('ci.yml', yaml), []);
  });

  it('reports a JavaScript comment inside a YAML block scalar', () => {
    const yaml = [
      'scenarios:',
      '- name: Loads',
      '  code: |-',
      '    // note',
      '    /* note */',
      '    runCode({});',
    ].join('\n');
    assert.deepEqual(findCommentLines('src/tests.yaml', yaml), [4, 5]);
  });

  it('allows a shebang on the first line only', () => {
    assert.deepEqual(findCommentLines('run.sh', '#!/usr/bin/env bash\necho ok'), []);
    assert.deepEqual(findCommentLines('run.sh', 'echo ok\n#!/usr/bin/env bash'), [2]);
  });

  it('reports every Terraform comment style', () => {
    assert.deepEqual(
      findCommentLines('main.tf', '# a\n// b\n/* c */\nname = "x" # d'),
      [1, 2, 3, 4],
    );
  });

  it('reports SQL comments outside generated migrations', () => {
    assert.deepEqual(findCommentLines('grants.sql', '-- a\nSELECT 1;\n/* b */'), [1, 3]);
    assert.deepEqual(findCommentLines('drizzle/0000.sql', '--> statement-breakpoint'), []);
  });

  it('reports comments in tsconfig files but not URLs in their values', () => {
    const tsconfig = '{\n  // a\n  "$schema": "https://json.schemastore.org/tsconfig"\n}';
    assert.deepEqual(findCommentLines('tsconfig.json', tsconfig), [2]);
  });

  it('handles Windows line endings', () => {
    assert.deepEqual(findCommentLines('ci.yml', 'a: 1\r\n# b\r\nc: 2'), [2]);
  });

  it('returns nothing for files it does not check', () => {
    assert.deepEqual(findCommentLines('README.md', '# Title'), []);
  });
});
