(() => {
  const logoSelectors = [
    '.channel-logo',
    '.health-brand',
    '.orders-channel-chip i',
    '.channel-mark',
    '.health-brand-tile',
    '.cs-channel-chips i',
    '.cs-avatar-channel',
    '.product-channels i',
    '.products-mapping-linked :is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.products-ad-columns article>div>span:is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.products-channel-stack i',
    '.payout-lanes :is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.settlement-table-head~button i:is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.provider-flow :is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.order-avatar',
    '.evidence-channel-list :is(.channel-naver,.channel-cafe,.channel-coupang)',
    '.product-analysis-channels :is(.channel-naver,.channel-cafe,.channel-coupang)',
    '#keywordSelectedMark',
  ].join(',');

  const brandMeta = {
    naver:{ glyph:'N', label:'네이버' },
    cafe24:{ glyph:'24', label:'Cafe24' },
    coupang:{ glyph:'C', label:'쿠팡' },
  };

  const inferBrand = element => {
    if (brandMeta[element.dataset.brand]) return element.dataset.brand;
    if (element.matches('.channel-naver,.naver') || element.closest('.naver')) return 'naver';
    if (element.matches('.channel-cafe,.cafe') || element.closest('.cafe')) return 'cafe24';
    if (element.matches('.channel-coupang,.coupang') || element.closest('.coupang')) return 'coupang';
    if (element.id === 'keywordSelectedMark') return element.textContent.trim() === 'C' ? 'coupang' : 'naver';
    const glyph = element.textContent.trim();
    if (glyph === 'N') return 'naver';
    if (glyph === '24') return 'cafe24';
    return null;
  };

  const inferSize = element => {
    if (element.matches('.cs-avatar-channel')) return 'micro';
    if (element.matches([
      '.orders-channel-chip i',
      '.channel-mark',
      '.cs-channel-chips i',
      '.product-channels i',
      '.products-mapping-linked :is(.channel-naver,.channel-cafe,.channel-coupang)',
      '.products-ad-columns article>div>span:is(.channel-naver,.channel-cafe,.channel-coupang)',
      '.products-channel-stack i',
      '.settlement-table-head~button i:is(.channel-naver,.channel-cafe,.channel-coupang)',
      '.order-avatar',
      '.evidence-channel-list :is(.channel-naver,.channel-cafe,.channel-coupang)',
      '.product-analysis-channels :is(.channel-naver,.channel-cafe,.channel-coupang)',
      '#keywordSelectedMark',
    ].join(','))) return 'compact';
    return 'standard';
  };

  const normalize = element => {
    if (!(element instanceof Element)) return;
    const brand = inferBrand(element);
    if (!brand) return;
    const meta = brandMeta[brand];
    element.classList.add('channel-brand-logo');
    element.dataset.brand = brand;
    element.dataset.logoSize = element.dataset.logoSize || inferSize(element);
    if (element.textContent.trim() !== meta.glyph) element.textContent = meta.glyph;
    element.setAttribute('aria-label',meta.label);
    element.setAttribute('role','img');
  };

  const normalizeAll = root => {
    if (root instanceof Element && root.matches(logoSelectors)) normalize(root);
    root.querySelectorAll?.(logoSelectors).forEach(normalize);
  };

  normalizeAll(document);
  window.HarinChannelLogo = { normalize, normalizeAll };

  new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node instanceof Element) normalizeAll(node);
      else if (node.parentElement?.matches?.(logoSelectors)) normalize(node.parentElement);
    }));
  }).observe(document.body,{ childList:true,subtree:true });
})();
