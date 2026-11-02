import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { run, type SandboxApis, type SandboxRequire, type TagData } from '../src/template.js';
import { createFakeSandbox } from './fake-sandbox.js';

interface Scenario {
  readonly name: string;
  readonly code: string;
}

interface EditorTests {
  readonly scenarios: readonly Scenario[];
  readonly setup?: string;
}

type Callable = (...args: readonly unknown[]) => unknown;

const editorTests = parse(
  readFileSync(new URL('../src/tests.yaml', import.meta.url), 'utf8'),
) as EditorTests;

function runScenario(code: string): void {
  const sandbox = createFakeSandbox();
  const mocks = new Map<string, unknown>();
  const calls = new Map<string, unknown[][]>();

  const record = (name: string, args: readonly unknown[]): void => {
    calls.set(name, [...(calls.get(name) ?? []), [...args]]);
  };

  const callsOf = (name: string): readonly unknown[][] => calls.get(name) ?? [];

  const api =
    (name: keyof SandboxApis): Callable =>
    (...args) => {
      record(name, args);
      if (!mocks.has(name)) {
        return (sandbox.apis[name] as Callable)(...args);
      }
      const mocked = mocks.get(name);
      return typeof mocked === 'function' ? (mocked as Callable)(...args) : mocked;
    };

  const require = ((name: keyof SandboxApis) => api(name)) as SandboxRequire;

  const testApi = {
    mock: (name: string, returnValue: unknown) => {
      mocks.set(name, returnValue);
    },
    runCode: (data: Readonly<Record<string, unknown>>) => {
      run(require, {
        ...data,
        gtmOnSuccess: () => {
          record('gtmOnSuccess', []);
        },
        gtmOnFailure: () => {
          record('gtmOnFailure', []);
        },
      } as unknown as TagData);
    },
    assertApi: (name: string) => ({
      wasCalled: () => {
        expect(callsOf(name).length, `${name} was not called`).toBeGreaterThan(0);
      },
      wasNotCalled: () => {
        expect(callsOf(name), `${name} was called`).toEqual([]);
      },
      wasCalledWith: (...expected: unknown[]) => {
        expect(callsOf(name)).toContainEqual(expected);
      },
      wasNotCalledWith: (...expected: unknown[]) => {
        expect(callsOf(name)).not.toContainEqual(expected);
      },
    }),
    assertThat: (actual: unknown) => ({
      isEqualTo: (expected: unknown) => {
        expect(actual).toEqual(expected);
      },
      isUndefined: () => {
        expect(actual).toBeUndefined();
      },
    }),
    fail: (message?: string) => {
      throw new Error(message ?? 'The scenario called fail()');
    },
  };

  runInNewContext(`${editorTests.setup ?? ''}\n${code}`, { ...testApi });
}

describe('the editor test scenarios, run against a stand-in for the Tag Manager test API', () => {
  it('include at least one scenario per behavior of the tag', () => {
    expect(editorTests.scenarios.length).toBeGreaterThanOrEqual(9);
  });

  it.each(editorTests.scenarios.map((scenario) => [scenario.name, scenario.code] as const))(
    '%s',
    (_name, code) => {
      runScenario(code);
    },
  );

  it('fail when an assertion of a scenario fails', () => {
    expect(() => {
      runScenario(
        "mock('injectScript', function () {});\nrunCode(initData());\nassertApi('gtmOnSuccess').wasCalled();",
      );
    }).toThrow('gtmOnSuccess was not called');
  });
});
