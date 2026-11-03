export type TagAction = 'init' | 'track';

export interface PropertyRow {
  readonly key: string;
  readonly value: unknown;
}

export type EventProperties = Readonly<Record<string, unknown>>;

export interface TagData {
  readonly publicKey: string;
  readonly endpoint: string;
  readonly action: TagAction;
  readonly eventName?: string;
  readonly eventProperties?: readonly PropertyRow[];
  readonly respectConsent: boolean;
  readonly gtmOnSuccess: () => void;
  readonly gtmOnFailure: () => void;
}

export interface SandboxApis {
  readonly callInWindow: (path: string, ...args: readonly unknown[]) => unknown;
  readonly copyFromWindow: (key: string) => unknown;
  readonly injectScript: (
    url: string,
    onSuccess: () => void,
    onFailure: () => void,
    cacheToken?: string,
  ) => void;
  readonly isConsentGranted: (consentType: string) => boolean;
  readonly logToConsole: (...messages: readonly unknown[]) => void;
  readonly makeTableMap: (
    table: readonly PropertyRow[],
    keyColumn: string,
    valueColumn: string,
  ) => EventProperties | null;
  readonly queryPermission: (permission: string, ...args: readonly unknown[]) => boolean;
}

export type SandboxRequire = <Name extends keyof SandboxApis>(name: Name) => SandboxApis[Name];

export function run(require: SandboxRequire, data: TagData): void {
  const PYXIS_SCRIPT_URL =
    'https://cdn.jsdelivr.net/npm/pyxis-analytics@0.7.0/dist/pyxis.global.js';
  const SCRIPT_CACHE_TOKEN = 'pyxis-analytics';
  const CONSENT_TYPE = 'analytics_storage';
  const RESERVED_EVENT_NAMES = ['page_view', 'identify', 'api_request'];
  const LOG_PREFIX = '[Pyxis]';

  const callInWindow = require('callInWindow');
  const copyFromWindow = require('copyFromWindow');
  const injectScript = require('injectScript');
  const isConsentGranted = require('isConsentGranted');
  const logToConsole = require('logToConsole');
  const makeTableMap = require('makeTableMap');
  const queryPermission = require('queryPermission');

  const consentAllowsTracking = (): boolean =>
    !data.respectConsent || isConsentGranted(CONSENT_TYPE);

  const fail = (reason: string): void => {
    logToConsole(LOG_PREFIX, reason);
    data.gtmOnFailure();
  };

  const initialize = (): void => {
    if (!queryPermission('inject_script', PYXIS_SCRIPT_URL)) {
      fail('This container does not allow loading ' + PYXIS_SCRIPT_URL);
      return;
    }
    injectScript(
      PYXIS_SCRIPT_URL,
      () => {
        callInWindow('pyxis.init', { key: data.publicKey, endpoint: data.endpoint });
        data.gtmOnSuccess();
      },
      () => {
        fail('Could not load ' + PYXIS_SCRIPT_URL);
      },
      SCRIPT_CACHE_TOKEN,
    );
  };

  const eventProperties = (): EventProperties | undefined => {
    if (data.eventProperties === undefined) {
      return undefined;
    }
    const properties = makeTableMap(data.eventProperties, 'key', 'value');
    if (properties === null) {
      return undefined;
    }
    return properties;
  };

  const trackEvent = (): void => {
    const eventName = data.eventName;
    if (!eventName) {
      fail('Track event needs an event name');
      return;
    }
    if (RESERVED_EVENT_NAMES.indexOf(eventName) !== -1) {
      fail('The event name ' + eventName + ' is reserved for the tracker');
      return;
    }
    if (!copyFromWindow('pyxis')) {
      fail('The tracker is not on the page: fire a Pyxis Initialize tag before this one');
      return;
    }
    callInWindow('pyxis.track', eventName, eventProperties());
    data.gtmOnSuccess();
  };

  if (!consentAllowsTracking()) {
    logToConsole(LOG_PREFIX, CONSENT_TYPE + ' is not granted: Pyxis stays off');
    data.gtmOnSuccess();
  } else if (data.action === 'track') {
    trackEvent();
  } else {
    initialize();
  }
}
