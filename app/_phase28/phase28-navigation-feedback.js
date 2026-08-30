'use client';

export const PHASE28_NAVIGATION_START_EVENT='phase28:navigation-start';

export function announcePhase28Navigation() {
  if(typeof window!=='undefined')window.dispatchEvent(new Event(PHASE28_NAVIGATION_START_EVENT));
}

export function pushPhase28Route(router,href) {
  if(typeof window!=='undefined'){
    const destination=new URL(href,window.location.href);
    const current=new URL(window.location.href);
    if(destination.pathname===current.pathname&&destination.search===current.search&&destination.hash===current.hash)return;
  }
  announcePhase28Navigation();
  router.push(href);
}
