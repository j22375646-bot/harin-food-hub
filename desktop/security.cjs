'use strict';

const path = require('node:path');

const APP_ENTRY_URL = 'moaon://app/index.html';
const ALLOWED_APP_RESOURCES = new Map([
  [APP_ENTRY_URL, 'index.html'],
  ['moaon://app/styles.css', 'styles.css'],
  ['moaon://app/app.js', 'app.js'],
]);

function isAllowedAppUrl(candidate) {
  return typeof candidate === 'string' && ALLOWED_APP_RESOURCES.has(candidate);
}

function resolveAppResource(candidate, uiRoot) {
  if (!isAllowedAppUrl(candidate)) {
    throw new Error('Blocked app resource');
  }

  if (typeof uiRoot !== 'string' || uiRoot.length === 0 || !path.isAbsolute(uiRoot)) {
    throw new Error('Invalid UI root');
  }

  const root = path.resolve(uiRoot);
  const resourcePath = path.resolve(root, ALLOWED_APP_RESOURCES.get(candidate));
  const relativePath = path.relative(root, resourcePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Blocked app resource');
  }

  return resourcePath;
}

module.exports = {
  APP_ENTRY_URL,
  ALLOWED_APP_RESOURCES,
  isAllowedAppUrl,
  resolveAppResource,
};
