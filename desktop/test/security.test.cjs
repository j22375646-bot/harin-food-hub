'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  APP_ENTRY_URL,
  isAllowedAppUrl,
  resolveAppResource,
} = require('../security.cjs');

const UI_ROOT = path.resolve('C:\\preview-fixture\\ui');

test('registered moaon app resources are allowed', () => {
  assert.equal(APP_ENTRY_URL, 'moaon://app/index.html');

  for (const resource of ['index.html', 'styles.css', 'app.js']) {
    assert.equal(isAllowedAppUrl(`moaon://app/${resource}`), true);
    assert.equal(
      resolveAppResource(`moaon://app/${resource}`, UI_ROOT),
      path.join(UI_ROOT, resource),
    );
  }
});

test('unregistered paths and ambiguous URL variants are rejected', () => {
  const rejectedUrls = [
    'moaon://app/',
    'moaon://app/index.html?preview=true',
    'moaon://app/index.html#orders',
    'moaon://user@app/index.html',
    'moaon://app:443/index.html',
    'moaon://other/index.html',
    'https://app/index.html',
    'file:///C:/preview/ui/index.html',
    'moaon://app/extra.js',
    'moaon://app/%2e%2e/index.html',
    'moaon://app/%2E%2E%2Findex.html',
    'moaon://app/%5c..%5cindex.html',
    'moaon://app/index%2ehtml',
  ];

  for (const url of rejectedUrls) {
    assert.equal(isAllowedAppUrl(url), false, url);
    assert.throws(
      () => resolveAppResource(url, UI_ROOT),
      /Blocked app resource/,
      url,
    );
  }
});

test('non-string and malformed inputs fail closed', () => {
  for (const input of [null, undefined, 42, '', 'not a url']) {
    assert.equal(isAllowedAppUrl(input), false);
    assert.throws(() => resolveAppResource(input, UI_ROOT), /Blocked app resource/);
  }
});

test('resolved resources cannot escape the supplied UI root', () => {
  assert.throws(
    () => resolveAppResource('moaon://app/index.html', ''),
    /Invalid UI root/,
  );
  assert.throws(
    () => resolveAppResource('moaon://app/index.html', null),
    /Invalid UI root/,
  );
});
