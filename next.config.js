'use strict';

const { HUB_LEGACY_ROUTES, routeFor } = require('./lib/navigation/hub-routes.js');
const { version } = require('./package.json');
const developmentScriptSource = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${developmentScriptSource}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

const securityHeaders = [
  { key:'Content-Security-Policy', value:contentSecurityPolicy },
  { key:'X-Content-Type-Options', value:'nosniff' },
  { key:'X-Frame-Options', value:'DENY' },
  { key:'X-Harin-Version', value:version },
  { key:'Referrer-Policy', value:'strict-origin-when-cross-origin' },
  { key:'Permissions-Policy', value:'camera=(), microphone=(), geolocation=(), payment=()' }
];

module.exports = {
  webpack(config) {
    if (process.platform !== 'win32') return config;
    const {normalizeWindowsWebpackEntries}=require('./lib/build/windows-webpack-entries.js');
    const original=config.entry;
    config.entry=typeof original==='function'
      ? async function(...args){return normalizeWindowsWebpackEntries(await original.apply(this,args));}
      : normalizeWindowsWebpackEntries(original);
    return config;
  },
  poweredByHeader:false,
  allowedDevOrigins:['127.0.0.1'],
  distDir:process.env.NEXT_DIST_DIR || '.next',
  turbopack:{root:__dirname},
  async redirects() {
    return [
      {source:'/favicon.ico',destination:'/icon.svg',permanent:true},
      ...HUB_LEGACY_ROUTES.map(item=>({source:item.href,destination:routeFor(item.view),permanent:true}))
    ];
  },
  async headers() {
    return [
      { source:'/:path*', headers:securityHeaders },
      {
        source:'/hub-sw.js',
        headers:[
          { key:'Content-Type', value:'application/javascript; charset=utf-8' },
          { key:'Cache-Control', value:'no-cache, no-store, must-revalidate' }
        ]
      },
      {
        source:'/hub-offline-v1.html',
        headers:[{ key:'Cache-Control', value:'public, max-age=31536000, immutable' }]
      },
      {
        source:'/hub-offline-v2.html',
        headers:[{ key:'Cache-Control', value:'public, max-age=31536000, immutable' }]
      },
      {
        source:'/api/:path*',
        headers:[
          { key:'Cache-Control', value:'private, no-store, max-age=0, must-revalidate' },
          { key:'Pragma', value:'no-cache' },
          { key:'Expires', value:'0' }
        ]
      },
      {
        source:'/:path(login|admin.*)',
        headers:[
          { key:'Cache-Control', value:'private, no-store, max-age=0, must-revalidate' },
          { key:'Pragma', value:'no-cache' },
          { key:'Expires', value:'0' }
        ]
      }
    ];
  }
};
