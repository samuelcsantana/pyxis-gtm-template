import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type PropertyRow, run, type TagAction } from '../src/template.js';
import { createFakeSandbox, type FakeSandboxOptions, tagData } from './fake-sandbox.js';

const RESERVED_EVENT_NAMES = ['page_view', 'identify', 'api_request'] as const;
const CONSENT_TYPE = 'analytics_storage';
const MAX_GENERATED_ROWS = 12;

const action = fc.constantFrom<TagAction>('init', 'track');

const eventName = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.constantFrom(...RESERVED_EVENT_NAMES),
  fc.string({ minLength: 1, maxLength: 40 }),
);

const propertyValue = fc.oneof(fc.string({ maxLength: 40 }), fc.integer(), fc.boolean());

const propertyRows: fc.Arbitrary<readonly PropertyRow[]> = fc.array(
  fc.record({ key: fc.string({ maxLength: 20 }), value: propertyValue }),
  { maxLength: MAX_GENERATED_ROWS },
);

const eventProperties = fc.option(propertyRows, { nil: undefined });

const sandboxOptions: fc.Arbitrary<FakeSandboxOptions> = fc.record({
  consent: fc.record({ [CONSENT_TYPE]: fc.boolean() }),
  scriptLoad: fc.constantFrom('loads', 'fails'),
  trackerOnPage: fc.boolean(),
  policyAllowsScript: fc.boolean(),
});

const sendableEventName = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((name) => !(RESERVED_EVENT_NAMES as readonly string[]).includes(name));

function expectedProperties(rows: readonly PropertyRow[] | undefined) {
  if (rows === undefined || rows.length === 0) {
    return undefined;
  }
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

describe('run properties', () => {
  it('reports exactly one outcome, success or failure, for any tag data once the script answers', () => {
    fc.assert(
      fc.property(
        action,
        eventName,
        eventProperties,
        fc.boolean(),
        sandboxOptions,
        (tagAction, name, rows, respectConsent, options) => {
          const data = tagData({
            action: tagAction,
            eventName: name,
            eventProperties: rows,
            respectConsent,
          });

          run(createFakeSandbox(options).require, data);

          expect(data.gtmOnSuccess.mock.calls.length + data.gtmOnFailure.mock.calls.length).toBe(1);
        },
      ),
    );
  });

  it('never loads the script or calls the tracker while analytics_storage is denied and the check is on', () => {
    fc.assert(
      fc.property(action, eventName, eventProperties, (tagAction, name, rows) => {
        const data = tagData({
          action: tagAction,
          eventName: name,
          eventProperties: rows,
          respectConsent: true,
        });
        const sandbox = createFakeSandbox({
          consent: { [CONSENT_TYPE]: false },
          trackerOnPage: true,
        });

        run(sandbox.require, data);

        expect(sandbox.apis.injectScript).not.toHaveBeenCalled();
        expect(sandbox.apis.callInWindow).not.toHaveBeenCalled();
        expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
      }),
    );
  });

  it('initializes the tracker with exactly the key and endpoint it was given', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (publicKey, endpoint) => {
        const data = tagData({ action: 'init', publicKey, endpoint });
        const sandbox = createFakeSandbox();

        run(sandbox.require, data);

        expect(sandbox.tracker.init).toHaveBeenCalledExactlyOnceWith({ key: publicKey, endpoint });
        expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
      }),
    );
  });

  it('never sends a reserved or empty event name, whatever the properties', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, '', ...RESERVED_EVENT_NAMES),
        eventProperties,
        (name, rows) => {
          const data = tagData({ action: 'track', eventName: name, eventProperties: rows });
          const sandbox = createFakeSandbox({ trackerOnPage: true });

          run(sandbox.require, data);

          expect(sandbox.tracker.track).not.toHaveBeenCalled();
          expect(data.gtmOnFailure).toHaveBeenCalledOnce();
        },
      ),
    );
  });

  it('sends any other event name unchanged, with the properties of the table', () => {
    fc.assert(
      fc.property(sendableEventName, eventProperties, (name, rows) => {
        const data = tagData({ action: 'track', eventName: name, eventProperties: rows });
        const sandbox = createFakeSandbox({ trackerOnPage: true });

        run(sandbox.require, data);

        expect(sandbox.tracker.track).toHaveBeenCalledExactlyOnceWith(
          name,
          expectedProperties(rows),
        );
        expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
      }),
    );
  });
});
