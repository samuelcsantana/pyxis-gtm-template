import { describe, expect, it } from 'vitest';
import { run } from '../src/template.js';
import {
  createFakeSandbox,
  declaredPermissions,
  ENDPOINT,
  type FakeSandboxOptions,
  PUBLIC_KEY,
  tagData,
} from './fake-sandbox.js';

const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/pyxis-analytics@0.6.0/dist/pyxis.global.js';
const CACHE_TOKEN = 'pyxis-analytics';

function runTag(data: ReturnType<typeof tagData>, options: FakeSandboxOptions = {}) {
  const sandbox = createFakeSandbox(options);
  run(sandbox.require, data);
  return sandbox;
}

describe('the Initialize action', () => {
  it('loads the pinned tracker once per page and initializes it with the key and endpoint', () => {
    const data = tagData();

    const sandbox = runTag(data);

    expect(sandbox.apis.injectScript).toHaveBeenCalledWith(
      SCRIPT_URL,
      expect.any(Function),
      expect.any(Function),
      CACHE_TOKEN,
    );
    expect(sandbox.tracker.init).toHaveBeenCalledWith({ key: PUBLIC_KEY, endpoint: ENDPOINT });
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
    expect(data.gtmOnFailure).not.toHaveBeenCalled();
  });

  it('pins an exact version of pyxis-analytics, the only script the permissions allow', () => {
    expect(SCRIPT_URL).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/pyxis-analytics@\d+\.\d+\.\d+\/dist\/pyxis\.global\.js$/,
    );
    expect(declaredPermissions.scriptUrls).toEqual([SCRIPT_URL]);
  });

  it('waits for the script before initializing or reporting success', () => {
    const data = tagData();

    const sandbox = runTag(data, { scriptLoad: 'never-answers' });

    expect(sandbox.apis.injectScript).toHaveBeenCalledOnce();
    expect(sandbox.tracker.init).not.toHaveBeenCalled();
    expect(data.gtmOnSuccess).not.toHaveBeenCalled();
    expect(data.gtmOnFailure).not.toHaveBeenCalled();
  });

  it('fails the tag and logs the URL when the script cannot load', () => {
    const data = tagData();

    const sandbox = runTag(data, { scriptLoad: 'fails' });

    expect(sandbox.tracker.init).not.toHaveBeenCalled();
    expect(data.gtmOnFailure).toHaveBeenCalledOnce();
    expect(data.gtmOnSuccess).not.toHaveBeenCalled();
    expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
      '[Pyxis]',
      `Could not load ${SCRIPT_URL}`,
    );
  });

  it('fails the tag without injecting when the container policy blocks the script', () => {
    const data = tagData();

    const sandbox = runTag(data, { policyAllowsScript: false });

    expect(sandbox.apis.queryPermission).toHaveBeenCalledWith('inject_script', SCRIPT_URL);
    expect(sandbox.apis.injectScript).not.toHaveBeenCalled();
    expect(data.gtmOnFailure).toHaveBeenCalledOnce();
    expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
      '[Pyxis]',
      `This container does not allow loading ${SCRIPT_URL}`,
    );
  });
});

describe('the Track event action', () => {
  it('sends the event with the properties of the table', () => {
    const data = tagData({
      action: 'track',
      eventName: 'signup_completed',
      eventProperties: [
        { key: 'plan', value: 'pro' },
        { key: 'step', value: 2 },
      ],
    });

    const sandbox = runTag(data, { trackerOnPage: true });

    expect(sandbox.tracker.track).toHaveBeenCalledWith('signup_completed', {
      plan: 'pro',
      step: 2,
    });
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
    expect(sandbox.apis.injectScript).not.toHaveBeenCalled();
  });

  it('sends no properties when the table has no rows', () => {
    const data = tagData({ action: 'track', eventName: 'export_clicked', eventProperties: [] });

    const sandbox = runTag(data, { trackerOnPage: true });

    expect(sandbox.tracker.track).toHaveBeenCalledWith('export_clicked', undefined);
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
  });

  it('sends no properties when the table is absent', () => {
    const data = tagData({ action: 'track', eventName: 'export_clicked' });

    const sandbox = runTag(data, { trackerOnPage: true });

    expect(sandbox.tracker.track).toHaveBeenCalledWith('export_clicked', undefined);
    expect(sandbox.apis.makeTableMap).not.toHaveBeenCalled();
  });

  it('fails the tag when no Initialize tag has put the tracker on the page', () => {
    const data = tagData({ action: 'track', eventName: 'signup_completed' });

    const sandbox = runTag(data);

    expect(sandbox.apis.callInWindow).not.toHaveBeenCalled();
    expect(data.gtmOnFailure).toHaveBeenCalledOnce();
    expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
      '[Pyxis]',
      'The tracker is not on the page: fire a Pyxis Initialize tag before this one',
    );
  });

  it.each([undefined, ''])('fails the tag when the event name is %j', (eventName) => {
    const data = tagData({ action: 'track', eventName });

    const sandbox = runTag(data, { trackerOnPage: true });

    expect(sandbox.tracker.track).not.toHaveBeenCalled();
    expect(data.gtmOnFailure).toHaveBeenCalledOnce();
    expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
      '[Pyxis]',
      'Track event needs an event name',
    );
  });

  it.each(['page_view', 'identify', 'api_request'])(
    'fails the tag for the reserved event name %s',
    (eventName) => {
      const data = tagData({ action: 'track', eventName });

      const sandbox = runTag(data, { trackerOnPage: true });

      expect(sandbox.tracker.track).not.toHaveBeenCalled();
      expect(data.gtmOnFailure).toHaveBeenCalledOnce();
      expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
        '[Pyxis]',
        `The event name ${eventName} is reserved for the tracker`,
      );
    },
  );
});

describe('Consent Mode', () => {
  const denied = { analytics_storage: false };

  it('keeps Pyxis off and reports success when analytics_storage is denied', () => {
    const data = tagData();

    const sandbox = runTag(data, { consent: denied });

    expect(sandbox.apis.isConsentGranted).toHaveBeenCalledWith('analytics_storage');
    expect(sandbox.apis.injectScript).not.toHaveBeenCalled();
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
    expect(data.gtmOnFailure).not.toHaveBeenCalled();
    expect(sandbox.apis.logToConsole).toHaveBeenCalledWith(
      '[Pyxis]',
      'analytics_storage is not granted: Pyxis stays off',
    );
  });

  it('sends no event when analytics_storage is denied after the tracker loaded', () => {
    const data = tagData({ action: 'track', eventName: 'signup_completed' });

    const sandbox = runTag(data, { consent: denied, trackerOnPage: true });

    expect(sandbox.tracker.track).not.toHaveBeenCalled();
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
  });

  it('loads the tracker when analytics_storage is granted', () => {
    const data = tagData();

    const sandbox = runTag(data, { consent: { analytics_storage: true } });

    expect(sandbox.tracker.init).toHaveBeenCalledOnce();
  });

  it('ignores consent when the site owner turned the check off', () => {
    const data = tagData({ respectConsent: false });

    const sandbox = runTag(data, { consent: denied });

    expect(sandbox.apis.isConsentGranted).not.toHaveBeenCalled();
    expect(sandbox.tracker.init).toHaveBeenCalledOnce();
  });

  it('tracks with consent ignored even when analytics_storage is denied', () => {
    const data = tagData({ action: 'track', eventName: 'signup_completed', respectConsent: false });

    const sandbox = runTag(data, { consent: denied, trackerOnPage: true });

    expect(sandbox.tracker.track).toHaveBeenCalledWith('signup_completed', undefined);
  });
});
