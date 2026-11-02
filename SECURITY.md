# Security policy

## Supported versions

Only the latest version of the template receives security fixes. Tag Manager tells containers
that use it when a new version is published in the Community Template Gallery.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/samuelcsantana/pyxis-gtm-template/security/advisories/new).
Do not open a public issue.

Include what you found, how to reproduce it and the impact you expect. You will get an
acknowledgement within a few days, and the fix will be credited to you if you wish.

## Scope

Of particular interest:

- the template loading a script other than the exact tracker version it pins, or permissions
  broader than the code needs;
- the tracker loading or an event being sent while `analytics_storage` is denied and the consent
  check is on;
- a way for a field, a variable or the page to make the template run code or send requests
  elsewhere;
- personal data reaching an event through the template.

Vulnerabilities in the tracker itself belong to
[pyxis-sdk](https://github.com/samuelcsantana/pyxis-sdk/security/advisories/new), and those of the
API to [pyxis-api](https://github.com/samuelcsantana/pyxis-api/security/advisories/new).
