'use strict';

const { HUB_NAV } = require('./lib/navigation/hub-routes.js');

const securityHeaders = [
  { key:'X-Content-Type-Options', value:'nosniff' },
  { key:'X-Frame-Options', value:'DENY' },
  { key:'Referrer-Policy', value:'strict-origin-when-cross-origin' },
  { key:'Permissions-Policy', value:'camera=(), microphone=(), geolocation=(), payment=()' }
];

module.exports = {
  async rewrites() {
    return HUB_NAV.filter(item=>item.href!=='/').map(item=>({ source:item.href, destination:`/?view=${item.id}` }));
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
