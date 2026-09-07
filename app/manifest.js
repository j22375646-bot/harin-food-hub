import brand from '../lib/brand.js';

export default function manifest() {
  return {
    id: '/',
    start_url: '/',
    scope: '/',
    name: brand.name,
    short_name: brand.shortName,
    description: `${brand.name} · ${brand.tagline}`,
    lang: 'ko',
    display: 'standalone',
    background_color: '#f7f4ff',
    theme_color: '#6f63bd',
    icons: [
      { src: '/icons/hub-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/hub-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  };
}
