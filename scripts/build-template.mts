import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

export const RUN_SIGNATURE = 'export function run(require, data) {';
export const RUN_END = '}';
export const TEMPLATE_FILE = 'template.tpl';

export interface TemplateSection {
  readonly name: string;
  readonly content: string;
}

export interface TemplateSources {
  readonly info: Readonly<Record<string, unknown>>;
  readonly thumbnail: Uint8Array;
  readonly parameters: unknown;
  readonly code: string;
  readonly permissions: unknown;
  readonly tests: string;
}

const INDENT = '  ';

export function transpileForSandbox(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2015,
      module: ts.ModuleKind.ES2015,
      removeComments: true,
      newLine: ts.NewLineKind.LineFeed,
    },
  }).outputText;
}

function dedent(line: string): string {
  if (line === '') {
    return line;
  }
  if (!line.startsWith(INDENT)) {
    throw new Error(`A line of run() is not indented as its body: ${line}`);
  }
  return line.slice(INDENT.length);
}

export function extractRunBody(javascript: string): string {
  const lines = javascript.split('\n');
  const start = lines.indexOf(RUN_SIGNATURE);
  const end = lines.lastIndexOf(RUN_END);
  if (start === -1 || end <= start) {
    throw new Error(
      'src/template.ts must export function run(require, data) holding the whole tag',
    );
  }
  const outside = [...lines.slice(0, start), ...lines.slice(end + 1)].filter(
    (line) => line.trim() !== '',
  );
  if (outside.length > 0) {
    throw new Error(`Code outside run() would not reach the template: ${outside.join(' | ')}`);
  }
  return lines
    .slice(start + 1, end)
    .map(dedent)
    .join('\n');
}

export async function sandboxedCode(source: string, configFile: string): Promise<string> {
  const config = await resolveConfig(configFile);
  const javascript = await format(transpileForSandbox(source), {
    ...config,
    parser: 'babel',
    trailingComma: 'es5',
  });
  return extractRunBody(javascript);
}

export function thumbnailDataUri(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function assembleTemplate(sections: readonly TemplateSection[]): string {
  return sections
    .map((section) => `___${section.name}___\n\n${section.content.trimEnd()}\n\n\n`)
    .join('');
}

export function templateSections(sources: TemplateSources, code: string): TemplateSection[] {
  const brand = sources.info.brand as Readonly<Record<string, unknown>>;
  const info = {
    ...sources.info,
    brand: { ...brand, thumbnail: thumbnailDataUri(sources.thumbnail) },
  };
  return [
    { name: 'INFO', content: toJson(info) },
    { name: 'TEMPLATE_PARAMETERS', content: toJson(sources.parameters) },
    { name: 'SANDBOXED_JS_FOR_WEB_TEMPLATE', content: code },
    { name: 'WEB_PERMISSIONS', content: toJson(sources.permissions) },
    { name: 'TESTS', content: sources.tests },
  ];
}

function readJson(file: URL): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

export function readSources(root: URL): TemplateSources {
  return {
    info: readJson(new URL('src/info.json', root)) as Readonly<Record<string, unknown>>,
    thumbnail: readFileSync(new URL('.github/assets/thumbnail-96.png', root)),
    parameters: readJson(new URL('src/template-parameters.json', root)),
    code: readFileSync(new URL('src/template.ts', root), 'utf8'),
    permissions: readJson(new URL('src/web-permissions.json', root)),
    tests: readFileSync(new URL('src/tests.yaml', root), 'utf8'),
  };
}

export async function buildTemplate(root: URL): Promise<string> {
  const sources = readSources(root);
  const code = await sandboxedCode(sources.code, fileURLToPath(new URL('.prettierrc.json', root)));
  return assembleTemplate(templateSections(sources, code));
}

async function main(): Promise<void> {
  const root = new URL('../', import.meta.url);
  writeFileSync(new URL(TEMPLATE_FILE, root), await buildTemplate(root));
}

if (import.meta.main) {
  await main();
}
