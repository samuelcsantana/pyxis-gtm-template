import { readFileSync } from 'node:fs';
import { type Mock, vi } from 'vitest';
import type {
  EventProperties,
  PropertyRow,
  SandboxApis,
  SandboxRequire,
  TagData,
} from '../src/template.js';

type GtmValue =
  | { readonly type: 1; readonly string: string }
  | { readonly type: 2; readonly listItem: readonly GtmValue[] }
  | {
      readonly type: 3;
      readonly mapKey: readonly GtmValue[];
      readonly mapValue: readonly GtmValue[];
    }
  | { readonly type: 8; readonly boolean: boolean };

interface GtmPermission {
  readonly instance: {
    readonly key: { readonly publicId: string };
    readonly param: readonly { readonly key: string; readonly value: GtmValue }[];
  };
}

type Decoded = string | boolean | readonly Decoded[] | ReadonlyMap<string, Decoded>;

export interface GlobalAccess {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}

export interface DeclaredPermissions {
  readonly logging: readonly string[];
  readonly scriptUrls: readonly string[];
  readonly globals: ReadonlyMap<string, GlobalAccess>;
  readonly consentReads: readonly string[];
}

function decode(value: GtmValue): Decoded {
  switch (value.type) {
    case 1:
      return value.string;
    case 8:
      return value.boolean;
    case 2:
      return value.listItem.map(decode);
    case 3:
      return new Map(
        value.mapKey.map((key, index) => {
          const mapped = value.mapValue[index];
          if (mapped === undefined) {
            throw new Error('A permission map has fewer values than keys');
          }
          return [asString(decode(key)), decode(mapped)];
        }),
      );
    default:
      return assertNever(value);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

function asList(value: Decoded | undefined): readonly Decoded[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? (value as readonly Decoded[]) : [value];
}

function asString(value: Decoded | undefined): string {
  if (typeof value !== 'string') {
    throw new Error('Expected a permission string');
  }
  return value;
}

function asMap(value: Decoded): ReadonlyMap<string, Decoded> {
  if (!(value instanceof Map)) {
    throw new Error('Expected a permission map');
  }
  return value;
}

function paramOf(permissions: readonly GtmPermission[], publicId: string, key: string): Decoded {
  const param = permissions
    .find((permission) => permission.instance.key.publicId === publicId)
    ?.instance.param.find((candidate) => candidate.key === key);
  return param === undefined ? [] : decode(param.value);
}

export function readDeclaredPermissions(): DeclaredPermissions {
  const permissions = JSON.parse(
    readFileSync(new URL('../src/web-permissions.json', import.meta.url), 'utf8'),
  ) as readonly GtmPermission[];
  const globals = asList(paramOf(permissions, 'access_globals', 'keys')).map(asMap);
  const consentTypes = asList(paramOf(permissions, 'access_consent', 'consentTypes')).map(asMap);
  return {
    logging: asList(paramOf(permissions, 'logging', 'environments')).map(asString),
    scriptUrls: asList(paramOf(permissions, 'inject_script', 'urls')).map(asString),
    globals: new Map(
      globals.map((entry) => [
        asString(entry.get('key')),
        {
          read: entry.get('read') === true,
          write: entry.get('write') === true,
          execute: entry.get('execute') === true,
        },
      ]),
    ),
    consentReads: consentTypes
      .filter((entry) => entry.get('read') === true)
      .map((entry) => asString(entry.get('consentType'))),
  };
}

export const declaredPermissions = readDeclaredPermissions();

export interface FakeTracker {
  readonly init: Mock<(options: unknown) => void>;
  readonly track: Mock<(name: unknown, properties?: unknown) => void>;
}

export type ScriptLoad = 'loads' | 'fails' | 'never-answers';

export interface FakeSandboxOptions {
  readonly consent?: Readonly<Partial<Record<string, boolean>>>;
  readonly scriptLoad?: ScriptLoad;
  readonly trackerOnPage?: boolean;
  readonly policyAllowsScript?: boolean;
}

export type FakeApis = { readonly [Name in keyof SandboxApis]: Mock<SandboxApis[Name]> };

export interface FakeSandbox {
  readonly require: SandboxRequire;
  readonly apis: FakeApis;
  readonly tracker: FakeTracker;
  readonly page: { pyxis?: FakeTracker };
}

type Callable = (...args: readonly unknown[]) => unknown;

function requirePermission(granted: boolean, what: string): void {
  if (!granted) {
    throw new Error(`The template has no permission to ${what}`);
  }
}

export function createFakeSandbox(options: FakeSandboxOptions = {}): FakeSandbox {
  const tracker: FakeTracker = { init: vi.fn(), track: vi.fn() };
  const page: { pyxis?: FakeTracker } = options.trackerOnPage === true ? { pyxis: tracker } : {};
  const scriptLoad = options.scriptLoad ?? 'loads';
  const permissions = declaredPermissions;

  const lookUp = (path: string): unknown => {
    const [root, member, ...rest] = path.split('.');
    if (root !== 'pyxis' || rest.length > 0 || page.pyxis === undefined) {
      return undefined;
    }
    if (member === undefined) {
      return page.pyxis;
    }
    return member === 'init' || member === 'track' ? page.pyxis[member] : undefined;
  };

  const apis: FakeApis = {
    callInWindow: vi.fn((path: string, ...args: readonly unknown[]) => {
      requirePermission(permissions.globals.get(path)?.execute === true, `execute ${path}`);
      const target = lookUp(path);
      return typeof target === 'function' ? (target as Callable)(...args) : undefined;
    }),
    copyFromWindow: vi.fn((key: string) => {
      requirePermission(permissions.globals.get(key)?.read === true, `read ${key}`);
      return lookUp(key);
    }),
    injectScript: vi.fn((url: string, onSuccess: () => void, onFailure: () => void) => {
      requirePermission(permissions.scriptUrls.includes(url), `inject ${url}`);
      if (scriptLoad === 'loads') {
        page.pyxis = tracker;
        onSuccess();
      } else if (scriptLoad === 'fails') {
        onFailure();
      }
    }),
    isConsentGranted: vi.fn((consentType: string) => {
      requirePermission(permissions.consentReads.includes(consentType), `read ${consentType}`);
      return options.consent?.[consentType] ?? true;
    }),
    logToConsole: vi.fn(() => {
      requirePermission(permissions.logging.length > 0, 'log');
    }),
    makeTableMap: vi.fn((table: readonly PropertyRow[], keyColumn: string, valueColumn: string) => {
      requirePermission(keyColumn === 'key' && valueColumn === 'value', 'read other columns');
      const properties: EventProperties = Object.fromEntries(
        table.map((row) => [row.key, row.value]),
      );
      return table.length === 0 ? null : properties;
    }),
    queryPermission: vi.fn(
      (permission: string, ...args: readonly unknown[]) =>
        permission === 'inject_script' &&
        options.policyAllowsScript !== false &&
        permissions.scriptUrls.includes(String(args[0])),
    ),
  };

  const require = <Name extends keyof SandboxApis>(name: Name): SandboxApis[Name] => apis[name];

  return { require, apis, tracker, page };
}

export interface FakeTagData extends TagData {
  readonly gtmOnSuccess: Mock<() => void>;
  readonly gtmOnFailure: Mock<() => void>;
}

const PUBLIC_KEY_PREFIX = 'pyxis_pk_';

export const PUBLIC_KEY = `${PUBLIC_KEY_PREFIX}${'GtmTemplate'.padEnd(32, '0')}`;
export const ENDPOINT = 'https://api.pyxis-analytics.dev';

export function tagData(
  overrides: Partial<Omit<TagData, 'gtmOnSuccess' | 'gtmOnFailure'>> = {},
): FakeTagData {
  return {
    publicKey: PUBLIC_KEY,
    endpoint: ENDPOINT,
    action: 'init',
    respectConsent: true,
    ...overrides,
    gtmOnSuccess: vi.fn(),
    gtmOnFailure: vi.fn(),
  };
}
