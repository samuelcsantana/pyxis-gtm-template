import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  assembleTemplate,
  buildTemplate,
  extractRunBody,
  readSources,
  sandboxedCode,
  templateSections,
  thumbnailDataUri,
  toJson,
  transpileForSandbox,
} from './build-template.mts';

const root = new URL('../', import.meta.url);
const prettierConfig = fileURLToPath(new URL('.prettierrc.json', root));

describe('transpileForSandbox', () => {
  it('drops the types and keeps the arrow functions and const the sandbox supports', () => {
    const output = transpileForSandbox(
      [
        'interface Data { readonly a: string }',
        'export function run(require: (name: string) => unknown, data: Data): void {',
        '  const say = (text: string): void => {',
        '    require(text);',
        '  };',
        '  say(data.a);',
        '}',
      ].join('\n'),
    );
    assert.doesNotMatch(output, /interface|: string|: void|: Data/);
    assert.match(output, /^export function run\(require, data\) \{$/m);
    assert.match(output, /const say = \(text\) => \{/);
  });
});

describe('extractRunBody', () => {
  it('returns the body of run, one level less indented, blank lines kept', () => {
    const javascript = [
      'export function run(require, data) {',
      "  var a = require('a');",
      '',
      '  if (a) {',
      '    data.gtmOnSuccess();',
      '  }',
      '}',
      '',
    ].join('\n');
    assert.equal(
      extractRunBody(javascript),
      ["var a = require('a');", '', 'if (a) {', '  data.gtmOnSuccess();', '}'].join('\n'),
    );
  });

  it('refuses a module without run', () => {
    assert.throws(
      () => extractRunBody('export function main() {\n}\n'),
      /must export function run/,
    );
  });

  it('refuses code outside run, which would not reach the template', () => {
    const javascript = 'var leak = 1;\nexport function run(require, data) {\n  data.x();\n}\n';
    assert.throws(() => extractRunBody(javascript), /outside run\(\).*var leak = 1;/);
  });

  it('refuses a body line that is not indented', () => {
    const javascript = 'export function run(require, data) {\nvar a = 1;\n}\n';
    assert.throws(() => extractRunBody(javascript), /not indented/);
  });
});

describe('sandboxedCode', () => {
  it('formats the body with the repository style and no trailing comma in calls', async () => {
    const source = [
      'type Call = (...args: unknown[]) => void;',
      'export function run(require: (name: string) => Call, data: { readonly a: string }): void {',
      "  const call = require('callInWindow');",
      '  call(',
      "    'a-long-argument-that-makes-the-call-wrap-around-the-line-width',",
      '    data.a,',
      '  );',
      '}',
    ].join('\n');
    const code = await sandboxedCode(source, prettierConfig);
    assert.equal(
      code,
      [
        "const call = require('callInWindow');",
        "call('a-long-argument-that-makes-the-call-wrap-around-the-line-width', data.a);",
      ].join('\n'),
    );
  });

  it('keeps a call that exceeds the line width wrapped, still without a trailing comma', async () => {
    const source = [
      'export function run(require: (name: string) => (...args: unknown[]) => void, data: { readonly a: string }): void {',
      "  require('callInWindow')(",
      "    'a-long-argument-that-makes-the-call-wrap-around-the-line-width',",
      "    'another-long-argument-for-the-same-reason',",
      '    data.a,',
      '  );',
      '}',
    ].join('\n');
    const code = await sandboxedCode(source, prettierConfig);
    assert.equal(
      code,
      [
        "require('callInWindow')(",
        "  'a-long-argument-that-makes-the-call-wrap-around-the-line-width',",
        "  'another-long-argument-for-the-same-reason',",
        '  data.a',
        ');',
      ].join('\n'),
    );
  });
});

describe('assembleTemplate', () => {
  it('writes each section under its marker, the way Tag Manager exports templates', () => {
    assert.equal(
      assembleTemplate([
        { name: 'INFO', content: '{}\n' },
        { name: 'TESTS', content: 'scenarios: []' },
      ]),
      '___INFO___\n\n{}\n\n\n___TESTS___\n\nscenarios: []\n\n\n',
    );
  });
});

describe('thumbnailDataUri', () => {
  it('embeds the PNG as a base64 data URI', () => {
    assert.equal(thumbnailDataUri(Uint8Array.from([1, 2, 3])), 'data:image/png;base64,AQID');
  });
});

describe('toJson', () => {
  it('escapes the characters Tag Manager escapes when it exports a template', () => {
    assert.equal(
      toJson({ help: "Your project's key <b>&</b> a=1", hint: 'plain text' }),
      [
        '{',
        '  "help": "Your project\\u0027s key \\u003cb\\u003e\\u0026\\u003c/b\\u003e a\\u003d1",',
        '  "hint": "plain text"',
        '}',
      ].join('\n'),
    );
  });

  it('escapes the line and paragraph separators', () => {
    const separators = String.fromCharCode(0x2028, 0x2029);
    assert.equal(toJson([`a${separators}b`]), '[\n  "a\\u2028\\u2029b"\n]');
  });

  it('writes JSON that parses back to the same value', () => {
    const value = { help: "it's <ok> & a=b", list: [1, true, null] };
    assert.deepEqual(JSON.parse(toJson(value)), value);
  });
});

describe('templateSections', () => {
  it('puts the thumbnail into the brand and keeps the sections in export order', () => {
    const sections = templateSections(
      {
        info: { displayName: 'Pyxis Analytics', brand: { id: 'brand_dummy' } },
        thumbnail: Uint8Array.from([1, 2, 3]),
        parameters: [],
        code: '',
        permissions: [],
        tests: 'scenarios: []',
      },
      'data.gtmOnSuccess();',
    );
    assert.deepEqual(
      sections.map((section) => section.name),
      ['INFO', 'TEMPLATE_PARAMETERS', 'SANDBOXED_JS_FOR_WEB_TEMPLATE', 'WEB_PERMISSIONS', 'TESTS'],
    );
    assert.deepEqual(JSON.parse(sections[0]?.content ?? ''), {
      displayName: 'Pyxis Analytics',
      brand: { id: 'brand_dummy', thumbnail: 'data:image/png;base64,AQID' },
    });
    assert.equal(sections[2]?.content, 'data.gtmOnSuccess();');
    assert.equal(sections[4]?.content, 'scenarios: []');
  });
});

describe('the committed template.tpl', () => {
  it('is what the build writes from the sources', async () => {
    const committed = readFileSync(new URL('template.tpl', root), 'utf8');
    assert.equal(committed, await buildTemplate(root));
  });

  it('holds a thumbnail within the gallery limits', () => {
    const png = readSources(root).thumbnail;
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    assert.deepEqual([view.getUint32(16), view.getUint32(20)], [96, 96]);
    assert.ok(png.byteLength < 50 * 1024);
  });
});
