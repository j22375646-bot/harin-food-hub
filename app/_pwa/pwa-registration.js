'use client';

import { useEffect } from 'react';

export function scheduleHubServiceWorker({ windowObject, navigatorObject }) {
  if (process.env.NODE_ENV !== 'production' || !windowObject
    || !navigatorObject?.serviceWorker) return () => {};

  let cancelled = false;
  let idleId;
  let timerId;
  const register = () => {
    if (cancelled) return;
    // Catch both a browser's synchronous rejection and its rejected promise.
    try {
      Promise.resolve(navigatorObject.serviceWorker.register('/hub-sw.js', {
        scope: '/', updateViaCache: 'none'
      })).catch(() => {});
    } catch {
      // Installation is optional and never blocks the hub.
    }
  };
  const afterLoad = () => {
    if (cancelled) return;
    if (typeof windowObject.requestIdleCallback === 'function') {
      idleId = windowObject.requestIdleCallback(register);
    } else {
      timerId = windowObject.setTimeout(register, 1000);
    }
  };
  if (windowObject.document.readyState === 'complete') afterLoad();
  else windowObject.addEventListener('load', afterLoad, { once: true });

  return () => {
    cancelled = true;
    windowObject.removeEventListener('load', afterLoad);
    if (idleId !== undefined) windowObject.cancelIdleCallback?.(idleId);
    if (timerId !== undefined) windowObject.clearTimeout(timerId);
  };
}

export default function PwaRegistration() {
  useEffect(() => scheduleHubServiceWorker({ windowObject: window, navigatorObject: navigator }), []);
  return null;
}
