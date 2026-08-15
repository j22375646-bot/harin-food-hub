const ICONS = {
  today: <><path d="M5 11.5 12 5l7 6.5"/><path d="M7.5 10.5V20h9v-9.5M10 20v-5h4v5"/></>,
  orders: <><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="M4 7.5V17l8 4 8-4V7.5M12 12v9"/></>,
  customer: <><path d="M5 6.5h14v9H9l-4 3v-12Z"/><path d="M8 10h8M8 13h5"/></>,
  inventory: <><path d="M4 9 12 4l8 5v11H4V9Z"/><path d="M8 20v-6h8v6M7 10h2M11 10h2M15 10h2"/></>,
  settlement: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  analysis: <><path d="M5 19V9M10 19V5M15 19v-7M20 19V3"/><path d="M3 19h19"/></>,
  keyword: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  product: <><path d="M4 6.5 12 3l8 3.5V17L12 21l-8-4V6.5Z"/><path d="m4 6.5 8 4 8-4M12 10.5V21"/></>,
  execution: <><path d="M8 4h8M9 3v3m6-3v3M6 7h12v14H6V7Z"/><path d="m9 14 2 2 4-5"/></>,
  approvals: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  experiments: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M8 15h8"/></>,
  collection: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></>,
  alerts: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z"/><path d="M10 20h4"/></>,
  ai: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m18 13 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13ZM6 14l.7 1.3L8 16l-1.3.7L6 18l-.7-1.3L4 16l1.3-.7L6 14Z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  sync: <><path d="M20 7h-5V2M4 17h5v5"/><path d="M18.5 10A7 7 0 0 0 6.2 5.2L4 7M5.5 14A7 7 0 0 0 17.8 18.8L20 17"/></>,
  truck: <><path d="M3 6h11v11H3V6ZM14 10h4l3 3v4h-7v-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  note: <><path d="M5 3h14v18H5V3Z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9v6M11 9v6M15 9v6"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m18 14 .8 1.7 1.7.8-1.7.8L18 19l-.8-1.7-1.7-.8 1.7-.8L18 14Z"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>
};

const ALIASES = {
  main:'today', reports:'execution', changes:'approvals', validation:'execution',
  notifications:'alerts', knowledge:'ai', cs:'customer', insight:'analysis',
  keywords:'keyword', products:'product', diagnoses:'execution'
};

export function HarinIcon({ name, size=20, title, className='' }) {
  const iconName=ALIASES[name]||name;
  const content=ICONS[iconName]||ICONS.sparkles;
  return <svg className={`harinIcon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={title?'img':undefined} aria-hidden={title?undefined:true} aria-label={title} focusable="false">{title?<title>{title}</title>:null}{content}</svg>;
}

export default HarinIcon;
