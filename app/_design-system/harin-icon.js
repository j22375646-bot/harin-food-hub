const ICONS = {
  today: <><path d="M5 11.5 12 5l7 6.5"/><path d="M7.5 10.5V20h9v-9.5M10 20v-5h4v5"/></>,
  orders: <><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="M4 7.5V17l8 4 8-4V7.5M12 12v9"/></>,
  customer: <><path d="M5 6.5h14v9H9l-4 3v-12Z"/><path d="M8 10h8M8 13h5"/></>,
  inventory: <><path d="M4 9 12 4l8 5v11H4V9Z"/><path d="M8 20v-6h8v6M7 10h2M11 10h2M15 10h2"/></>,
  settlement: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  analysis: <><path d="M5 19V9M10 19V5M15 19v-7M20 19V3"/><path d="M3 19h19"/></>,
  keyword: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  product: <><path d="M4 6.5 12 3l8 3.5V17L12 21l-8-4V6.5Z"/><path d="m4 6.5 8 4 8-4M12 10.5V21"/></>,
  store: <><path d="M4 9h16l-1.5-5h-13L4 9Z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/><path d="M4 9a3 3 0 0 0 5 2 3 3 0 0 0 6 0 3 3 0 0 0 5-2"/></>,
  link: <><path d="M10 13a4.5 4.5 0 0 0 6.4.1l2-2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1"/><path d="M14 11a4.5 4.5 0 0 0-6.4-.1l-2 2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></>,
  price: <><path d="M4 7V4h16v3M6 7h12v13H6V7Z"/><path d="M9 11h6M9 15h6"/></>,
  checklist: <><path d="M9 5h10M9 12h10M9 19h10"/><path d="m3 5 1.5 1.5L7 3.5M3 12l1.5 1.5L7 10.5M3 19l1.5 1.5L7 17.5"/></>,
  growth: <><path d="M4 19h16M6 16l4-4 3 2 5-7"/><path d="M15 7h3v3"/></>,
  filter: <><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  server: <><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/></>,
  warning: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
  naverStore: <><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 16V8l8 8V8"/></>,
  shoppingBag: <><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></>,
  execution: <><path d="M8 4h8M9 3v3m6-3v3M6 7h12v14H6V7Z"/><path d="m9 14 2 2 4-5"/></>,
  approvals: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  experiments: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M8 15h8"/></>,
  collection: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></>,
  alerts: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z"/><path d="M10 20h4"/></>,
  ai: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m18 13 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13ZM6 14l.7 1.3L8 16l-1.3.7L6 18l-.7-1.3L4 16l1.3-.7L6 14Z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  sync: <><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v6h-6"/></>,
  truck: <><path d="M3 6h11v11H3V6ZM14 10h4l3 3v4h-7v-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  note: <><path d="M5 3h14v18H5V3Z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9v6M11 9v6M15 9v6"/></>,
  folder: <><path d="M3 6.5h7l2 2h9v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z"/><path d="M3 11h18"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></>,
  document: <><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 18 5-5 3 3 2-2 4 4"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m18 14 .8 1.7 1.7.8-1.7.8L18 19l-.8-1.7-1.7-.8 1.7-.8L18 14Z"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>
};

const ALIASES = {
  main:'today', reports:'execution', changes:'approvals', validation:'execution',
  notifications:'alerts', knowledge:'ai', cs:'customer', insight:'analysis',
  keywords:'keyword', products:'product', diagnoses:'execution', market:'growth', cafe24:'store',
  naver:'naverStore', coupang:'shoppingBag'
};

export function HarinIcon({ name, size=20, title, className='' }) {
  const iconName=ALIASES[name]||name;
  const content=ICONS[iconName]||ICONS.sparkles;
  return <svg className={`harinIcon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={title?'img':undefined} aria-hidden={title?undefined:true} aria-label={title} focusable="false">{title?<title>{title}</title>:null}{content}</svg>;
}

export default HarinIcon;
