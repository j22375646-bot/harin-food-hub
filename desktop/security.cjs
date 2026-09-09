'use strict';

const path = require('node:path');

const APP_ENTRY_URL = 'moaon://app/index.html';
const ALLOWED_APP_RESOURCES = new Map([
  [APP_ENTRY_URL, 'index.html'],
  ['moaon://app/styles.css', 'styles.css'],
  ['moaon://app/app.js', 'app.js'],
  ['moaon://app/studio.css', 'studio.css'],
  ['moaon://app/settlement.js', 'settlement.js'],
  ['moaon://app/insights.js', 'insights.js'],
  ['moaon://app/month-calendar.js', 'month-calendar.js'],
  ['moaon://app/month-calendar.css', 'month-calendar.css'],
  ['moaon://app/insights.css', 'insights.css'],
  ['moaon://app/settlement.css', 'settlement.css'],
  ['moaon://app/app-common.css', 'app-common.css'],
  ['moaon://app/api-settings.js', 'api-settings.js'],
  ['moaon://app/app-updates.js', 'app-updates.js'],
  ['moaon://app/inventory.js', 'inventory.js'],
  ['moaon://app/inventory.css', 'inventory.css'],
  ['moaon://app/cs.js', 'cs.js'],
  ['moaon://app/cs.css', 'cs.css'],
  ['moaon://app/fonts/PretendardVariable.ttf', 'fonts/PretendardVariable.ttf'],
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
