import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type CommentSyntax = 'hash' | 'yaml' | 'terraform' | 'sql' | 'jsonc';

const HASH_CONFIG_FILES = new Set([
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.editorconfig',
  '.prettierignore',
  '.nvmrc',
  '.npmrc',
]);

const GENERATED_PREFIXES = ['drizzle/', '.husky/_/'];

const COMMENT_LINE_STARTS: Readonly<Record<CommentSyntax, readonly string[]>> = {
  hash: ['#'],
  yaml: ['#', '//', '/*'],
  terraform: ['#', '//', '/*'],
  sql: ['--', '/*'],
  jsonc: ['//', '/*'],
};

const QUOTED_STRING = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const TRAILING_HASH_COMMENT = /\s#/;
const TSCONFIG_FILE = /^tsconfig.*\.json$/;

export function syntaxOf(filePath: string): CommentSyntax | undefined {
  const normalized = filePath.replaceAll('\\', '/');
  if (GENERATED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return undefined;
  }
  const base = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized);
  if (extension === '.yml' || extension === '.yaml') {
    return 'yaml';
  }
  if (
    extension === '.sh' ||
    base.startsWith('Dockerfile') ||
    normalized.startsWith('.husky/') ||
    HASH_CONFIG_FILES.has(base)
  ) {
    return 'hash';
  }
  if (extension === '.tf' || extension === '.tfvars') {
    return 'terraform';
  }
  if (extension === '.sql') {
    return 'sql';
  }
  if (extension === '.jsonc' || TSCONFIG_FILE.test(base) || normalized.startsWith('.vscode/')) {
    return 'jsonc';
  }
  return undefined;
}

function hasTrailingHashComment(line: string): boolean {
  return TRAILING_HASH_COMMENT.test(line.replace(QUOTED_STRING, '""'));
}

export function findCommentLines(filePath: string, content: string): number[] {
  const syntax = syntaxOf(filePath);
  if (syntax === undefined) {
    return [];
  }
  const lineStarts = COMMENT_LINE_STARTS[syntax];
  const checksTrailingHash = syntax !== 'sql' && syntax !== 'jsonc';
  return content.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trimStart();
    if (index === 0 && trimmed.startsWith('#!')) {
      return [];
    }
    const isCommentLine = lineStarts.some((start) => trimmed.startsWith(start));
    const hasTrailingComment = checksTrailingHash && hasTrailingHashComment(line);
    return isCommentLine || hasTrailingComment ? [index + 1] : [];
  });
}

function filesToCheck(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file !== '' && existsSync(file));
}

function main(): void {
  const violations = filesToCheck().flatMap((file) =>
    findCommentLines(file, readFileSync(file, 'utf8')).map((line) => `${file}:${String(line)}`),
  );
  if (violations.length > 0) {
    console.error(
      `Comments are not allowed. Put the reasoning in the commit body, the pull request, an ADR or the README:\n${violations.join('\n')}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
