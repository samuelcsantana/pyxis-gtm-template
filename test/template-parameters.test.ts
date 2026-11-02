import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TagAction, TagData } from '../src/template.js';
import { PUBLIC_KEY } from './fake-sandbox.js';

interface Validator {
  readonly type: string;
  readonly args?: readonly unknown[];
}

interface TemplateParameter {
  readonly type: string;
  readonly name: string;
  readonly defaultValue?: unknown;
  readonly selectItems?: readonly { readonly value: string }[];
  readonly simpleTableColumns?: readonly TemplateParameter[];
  readonly valueValidators?: readonly Validator[];
  readonly enablingConditions?: readonly {
    readonly paramName: string;
    readonly paramValue: string;
  }[];
}

type TagField = Exclude<keyof TagData, 'gtmOnSuccess' | 'gtmOnFailure'>;

const TAG_FIELDS: Readonly<Record<TagField, true>> = {
  publicKey: true,
  endpoint: true,
  action: true,
  eventName: true,
  eventProperties: true,
  respectConsent: true,
};

const TAG_ACTIONS: Readonly<Record<TagAction, true>> = { init: true, track: true };

const SDK_MAX_PROPERTIES = 10;

const parameters = JSON.parse(
  readFileSync(new URL('../src/template-parameters.json', import.meta.url), 'utf8'),
) as readonly TemplateParameter[];

function parameter(name: string, list: readonly TemplateParameter[] = parameters) {
  const found = list.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`No template parameter named ${name}`);
  }
  return found;
}

function validator(field: TemplateParameter, type: string): Validator {
  const found = field.valueValidators?.find((candidate) => candidate.type === type);
  if (found === undefined) {
    throw new Error(`${field.name} has no ${type} validator`);
  }
  return found;
}

function pattern(field: TemplateParameter): RegExp {
  return new RegExp(String(validator(field, 'REGEX').args?.[0]));
}

describe('the template fields', () => {
  it('are exactly the fields the tag code reads', () => {
    expect(parameters.map((field) => field.name).sort()).toEqual(Object.keys(TAG_FIELDS).sort());
  });

  it('offer the actions the tag code handles, Initialize first and by default', () => {
    const action = parameter('action');
    expect(action.selectItems?.map((item) => item.value)).toEqual(Object.keys(TAG_ACTIONS));
    expect(action.defaultValue).toBe('init');
  });

  it('show the event name and properties only for Track event', () => {
    for (const name of ['eventName', 'eventProperties']) {
      expect(parameter(name).enablingConditions).toEqual([
        { paramName: 'action', paramValue: 'track', type: 'EQUALS' },
      ]);
    }
  });

  it('respect analytics_storage consent unless the site owner turns it off', () => {
    const consent = parameter('respectConsent');
    expect(consent.type).toBe('CHECKBOX');
    expect(consent.defaultValue).toBe(true);
  });

  it('send events to the Pyxis API by default', () => {
    const endpoint = parameter('endpoint');
    expect(endpoint.defaultValue).toBe('https://api.pyxis-analytics.dev');
    expect(pattern(endpoint).test('http://localhost:3040')).toBe(true);
    expect(pattern(endpoint).test('api.pyxis-analytics.dev')).toBe(false);
    expect(pattern(endpoint).test('https://api.pyxis-analytics.dev/?key=1')).toBe(false);
  });
});

describe('the field validation, mirroring the tracker rules', () => {
  it('accepts a public key and refuses a secret key or a malformed one', () => {
    const publicKey = pattern(parameter('publicKey'));
    expect(publicKey.test(PUBLIC_KEY)).toBe(true);
    expect(publicKey.test(PUBLIC_KEY.replace('_pk_', '_sk_'))).toBe(false);
    expect(publicKey.test(PUBLIC_KEY.slice(0, -1))).toBe(false);
    expect(publicKey.test(`${PUBLIC_KEY}0`)).toBe(false);
    expect(publicKey.test(PUBLIC_KEY.replace(/.$/, '-'))).toBe(false);
  });

  it.each(['signup_completed', 'a', 'export2', 'a'.repeat(64)])(
    'accepts the event name %s',
    (name) => {
      expect(pattern(parameter('eventName')).test(name)).toBe(true);
    },
  );

  it.each([
    'page_view',
    'identify',
    'api_request',
    'Signup',
    '2fa_enabled',
    '_private',
    'sign-up',
    'a'.repeat(65),
  ])('refuses the event name %s', (name) => {
    expect(pattern(parameter('eventName')).test(name)).toBe(false);
  });

  it('accepts property names of the tracker and refuses the others', () => {
    const table = parameter('eventProperties');
    const name = pattern(parameter('key', table.simpleTableColumns));
    expect(['plan', 'step_2', '2fa', 'a'.repeat(40)].every((key) => name.test(key))).toBe(true);
    expect(['Plan', 'plan-name', '', 'a'.repeat(41)].some((key) => name.test(key))).toBe(false);
  });

  it('keeps the table to the key and value columns read by the tag code', () => {
    const table = parameter('eventProperties');
    expect(table.simpleTableColumns?.map((column) => column.name)).toEqual(['key', 'value']);
  });

  it('allows as many properties as the tracker keeps', () => {
    expect(validator(parameter('eventProperties'), 'TABLE_ROW_COUNT').args).toEqual([
      0,
      SDK_MAX_PROPERTIES,
    ]);
  });
});
