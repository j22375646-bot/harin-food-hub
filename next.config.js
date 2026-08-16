'use strict';

const { HUB_LEGACY_ROUTES, routeFor } = require('./lib/navigation/hub-routes.js');
const { version } = require('./package.json');

const securityHeaders = [
  { key:'X-Content-Type-Options', value:'nosniff' },
  { key:'X-Frame-Options', value:'DENY' },
  { key:'X-Harin-Version', value:version },
  { key:'Referrer-Policy', value:'strict-origin-when-cross-origin' },
  { key:'Permissions-Policy', value:'camera=(), microphone=(), geolocation=(), payment=()' }
];

module.exports = {
  poweredByHeader:false,
  turbopack:{root:__dirname},
  async redirects() {
    return HUB_LEGACY_ROUTES.map(item=>({source:item.href,destination:routeFor(item.view),permanent:true}));
  },
  async headers() {
    return [
      { source:'/:path*', headers:securityHeaders },
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
