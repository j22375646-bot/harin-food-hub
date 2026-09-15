'use strict';

const path = require('node:path');

const APP_ENTRY_URL = 'moaon://app/index.html';
const ALLOWED_APP_RESOURCES = new Map([
  [APP_ENTRY_URL, 'index.html'],
  ['moaon://app/assistant-automation.js','assistant-automation.js'],
  ['moaon://app/assistant-bots.js','assistant-bots.js'],
  ['moaon://app/assistant-menu.js','assistant-menu.js'],
  ['moaon://app/assistant-learning.js','assistant-learning.js'],
  ['moaon://app/assistant-bot-automation.js','assistant-bot-automation.js'],
  ['moaon://app/assistant-access.js','assistant-access.js'],
  ['moaon://app/assistant.js','assistant.js'],
  ['moaon://app/assistant.css','assistant.css'],
  ['moaon://app/action-feedback.js','action-feedback.js'],
  ['moaon://app/dialog-chrome.js','dialog-chrome.js'],
  ['moaon://app/dialog-chrome.css','dialog-chrome.css'],
  ['moaon://app/ui-polish.css','ui-polish.css'],
  ['moaon://app/settings-tabs.js','settings-tabs.js'],
  ['moaon://app/settings-tabs.css','settings-tabs.css'],
  ['moaon://app/team.js','team.js'],
  ['moaon://app/team.css','team.css'],
  ['moaon://app/refinement.css','refinement.css'],
  ['moaon://app/styles.css', 'styles.css'],
  ['moaon://app/app.js', 'app.js'],
  ['moaon://app/studio.css', 'studio.css'],
  ['moaon://app/settlement.js', 'settlement.js'],
  ['moaon://app/insights.js', 'insights.js'],
  ['moaon://app/insight-ai.js', 'insight-ai.js'],
  ['moaon://app/insight-ai.css', 'insight-ai.css'],
  ['moaon://app/market-ai.js', 'market-ai.js'],
  ['moaon://app/general-chat.js', 'general-chat.js'],
  ['moaon://app/market-ai.css', 'market-ai.css'],
  ['moaon://app/marketing.js', 'marketing.js'],
  ['moaon://app/marketing.css', 'marketing.css'],
  ['moaon://app/keywords.js', 'keywords.js'],
  ['moaon://app/market-research.js','market-research.js'],
  ['moaon://app/market-research.css','market-research.css'],
  ['moaon://app/keyword-bids.js', 'keyword-bids.js'],
  ['moaon://app/keywords.css', 'keywords.css'],
  ['moaon://app/event-tools.js','event-tools.js'],
  ['moaon://app/marketing-summary.js','marketing-summary.js'],
  ['moaon://app/event-recommendations.js','event-recommendations.js'],
  ...['operations-tools.js','operations-ui.js','cs-tools.js','stock-planning.js'].map(file=>['moaon://app/'+file,file]),
  ['moaon://app/event-workbench.js','event-workbench.js'],
  ['moaon://app/month-calendar.js', 'month-calendar.js'],
  ['moaon://app/month-calendar.css', 'month-calendar.css'],
  ['moaon://app/insights.css', 'insights.css'],
  ['moaon://app/settlement.css', 'settlement.css'],
  ['moaon://app/app-common.css', 'app-common.css'],
  ['moaon://app/experience.css', 'experience.css'],
  ['moaon://app/daybook.css', 'daybook.css'],
  ['moaon://app/api-settings.js', 'api-settings.js'],
  ['moaon://app/connections.js', 'connections.js'],
  ['moaon://app/connections.css', 'connections.css'],
  ['moaon://app/app-updates.js', 'app-updates.js'],
  ['moaon://app/stock.js', 'stock.js'],
  ['moaon://app/stock-sales.js', 'stock-sales.js'],
  ['moaon://app/stock-portion.js', 'stock-portion.js'],
  ['moaon://app/stock-receipts.js', 'stock-receipts.js'],
  ['moaon://app/rocket-planner.js', 'rocket-planner.js'],
  ['moaon://app/stock.css', 'stock.css'],
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
