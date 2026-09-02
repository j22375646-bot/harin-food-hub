'use strict';

function scheduleAuthorizedSync({ capability, schedule, sync, onError = console.error } = {}) {
  if (!capability?.shouldCollect || typeof schedule !== 'function' || typeof sync !== 'function') return false;
  schedule(async () => {
    try {
      await sync('OAUTH_CALLBACK');
    } catch (error) {
      onError('Cafe24 OAuth post-connect sync failed', error);
    }
  });
  return true;
}

module.exports = { scheduleAuthorizedSync };
