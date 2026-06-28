/**
 * src/i18n/en.ts
 *
 * English translations for the MJ Maps landing site.
 * All visible user-facing text lives here — no hard-coded strings in components.
 *
 * Usage in Astro:
 *   import { t, tHtml } from './i18n/index.ts';
 *   <h1>{t('hero.headline')}</h1>
 *   <p set:html={tHtml('hero.sub')} />
 *
 * Usage in TS/JS:
 *   import { t, tHtml } from '../i18n/index.ts';
 *   document.title = t('meta.title');
 */

export const translations = {
  // ── Site-wide ───────────────────────────────────────────────────────────────
  nav: {
    features:   'Features',
    pricing:    'Pricing',
    forDrivers: 'For Drivers',
    forFleets:  'For Fleets',
    about:      'About',
    bookDemo:   'Book a demo',
    startTrial: 'Start free trial',
    openMenu:   'Open menu',
    closeMenu:  'Close menu',
  },

  cookie: {
    text:    'We use essential cookies only — no tracking, no advertising. Your location data is used for navigation only and is never sold.',
    policy:  'Cookie policy',
    accept:  'Accept',
    learnMore: 'Learn more',
  },

  footer: {
    tagline:        'Turn-by-turn navigation built for UK delivery drivers.',
    product:        'Product',
    features:       'Features',
    pricing:        'Pricing',
    drivers:        'For Drivers',
    fleet:          'For Fleets',
    about:          'About',
    security:       'Security',
    legal:          'Legal',
    privacy:        'Privacy Policy',
    terms:          'Terms of Service',
    cookies:        'Cookie Policy',
    contact:        'Contact',
    emailLabel:     'Email us',
    supportEmail:   'hello@mjmaps.app',
    copyright:      '© {year} MJ Maps Systems Ltd. All rights reserved.',
    companyNumber:   'Company No. 14892741',
    vatNumber:       'GB 432 8812 74',
  },

  // ── Home / Hero ──────────────────────────────────────────────────────────────
  hero: {
    eyebrowLabel: 'Live routing',
    coords:      '51.5074° N, 0.1278° W',
    headline:     'Stop guessing\nat every junction',
    sub:         'MJ Maps knows your van\'s height, weight, and turning radius. Every junction gets a GREEN, AMBER, or RED score before you reach it — plus the exact gate pin for every stop.',
    ctaPrimary:  'Start free trial — 14 days',
    ctaSecondary:'See features',
    trustCancel:   'Cancel anytime',
    trustNoRenew:  'No auto-renew',
    trustOffline:  'Works offline',
  },

  // ── Trust bar ─────────────────────────────────────────────────────────────────
  trustBar: {
    ukFounded:        'UK-founded',
    ukGdpr:           'UK GDPR compliant',
    fourteenDayTrial:  '14-day free trial',
    worksOffline:     'Works offline',
  },

  // ── Before/After slider ──────────────────────────────────────────────────────
  beforeAfter: {
    label:          'Precision delivery',
    headline:        'Know exactly\nwhere the gate is',
    sub:             'Standard sat-nav drops you at the postcode centroid — often 400 m from the actual gate, down a track your van can\'t turn around in. MJ Maps pins the exact delivery point and encodes it as a Plus Code.',
    tagPlusCodes:   'Plus Code encoding',
    tagGatePins:    'Gate & yard pins',
    tagCommunity:   'Community verification',
    beforeLabel:    'Postcode centroid',
    afterLabel:     'Gate pin + Plus Code',
    hint:            '← drag to compare →',
  },

  // ── Turn Score section ──────────────────────────────────────────────────────
  turnScore: {
    label:     'Turn-score intelligence',
    headline:  'Know before\nyou turn',
    sub1:      'Every junction gets scored against your exact vehicle profile. Green means clear. Amber means reduce speed. Red means re-routing around it — before you\'ve committed to the turn.',
    sub2:      'The score factors in your vehicle height, weight, turning radius, road width, and any active restrictions in OSM.',
    cta:       'See all features →',
  },

  // ── Features ─────────────────────────────────────────────────────────────────
  features: {
    // Feature tiles
    turnScore: {
      label:   'Turn Score',
      heading: 'Every junction graded before you reach it',
      sub:     'GREEN / AMBER / RED turn-score chips based on your vehicle profile, road width, and approach angle. Act before you\'re committed.',
    },
    gatePins: {
      label:   'Gate Pins',
      heading: 'Pin the exact delivery point — not the postcode',
      sub:     'Community-verified gate pins with Plus Code encoding. Driver-confirmed over three deliveries. Works without signal.',
    },
    offline: {
      label:   'Offline Maps',
      heading: 'Rural dead zones are part of the job. Your maps don\'t have to be.',
      sub:     'Download full UK road network offline. Updated weekly. No signal needed for navigation or pin lookups.',
    },
    routeOpt: {
      label:   'Route Optimiser',
      heading: 'More deliveries per shift without working harder',
      sub:     'Graph solver sequences your stops automatically. Anti-backtrack, side-of-road grouping, and 2-opt refinement included.',
    },
    fleet: {
      label:   'Fleet Tracking',
      heading: 'See every driver on one screen, live',
      sub:     'Dispatcher dashboard with live GPS, route progress, turn alerts, and POD capture. Built for ops teams who care about ETA accuracy.',
    },
    pod: {
      label:   'POD Capture',
      heading: 'Proof of delivery in seconds, not minutes',
      sub:     'Photo capture at the gate, geotagged and timestamped. Auto-uploads when signal returns. Integrates with your existing systems.',
    },
  },

  // ── How it works ────────────────────────────────────────────────────────────
  howItWorks: {
    label:    'How it works',
    headline: 'Three steps from postcode to pin',
    step1: {
      heading: 'Enter your stops',
      sub:     'Bulk import from CSV, type addresses, or draw on the map. One tap to optimise the route.',
    },
    step2: {
      heading: 'Get your turn scores',
      sub:     'Every junction is graded against your vehicle. Know which turns to take and which to avoid before you set off.',
    },
    step3: {
      heading: 'Navigate, deliver, repeat',
      sub:     'Turn-by-turn directions, offline maps, and gate-pin guidance. Completed stops sync automatically.',
    },
    cta:      'Start your free trial →',
  },

  // ── Solo vs Fleet ────────────────────────────────────────────────────────────
  soloVsFleet: {
    label:       'Built for every delivery operation',
    soloHeading:  'Solo drivers',
    soloSub:      'Set up in five minutes. Know your van fits every turn before you reach it. No more guessing.',
    fleetHeading: 'Fleet operators',
    fleetSub:     'Dispatcher dashboard, live driver tracking, route assignment, and POD capture — all in one place.',
    soloCta:      'Get Driver Pro →',
    fleetCta:     'Talk to us →',
  },

  // ── Pricing ──────────────────────────────────────────────────────────────────
  pricing: {
    label:    'Pricing',
    headline: 'Simple, honest pricing',
    sub:      'No setup fees. No per-stop charges. Cancel anytime — no auto-renew surprises. All prices include VAT.',
    popular:  'Most popular',
    driverPro: 'Driver Pro',
    driverProTag: 'Everything a solo or small-team driver needs',
    enterprise: 'Enterprise',
    enterpriseTag: 'Fleet-grade control for operations teams',
    perMonth:  '/mo',
    perYear:   '/yr',
    custom:   'Custom',
    vatYear:  '£97/yr if you pay yearly — saving £22.64. VAT included.',
    vatEnterprise: 'Tailored to your fleet size and needs. No minimum commitment.',
    cancelNote: '14-day trial. Cancel anytime. No card needed to start.',
    compareLink: 'See full feature comparison →',
    featureTurnScore:   'Vehicle-aware turn-score on every junction',
    featureGatePins:     'Gate-pin delivery + Plus Codes',
    featureOffline:      'Fully offline maps',
    featureRouteOpt:     'Route optimisation',
    featureSavedRoutes: 'Saved routes',
    featurePOD:          'POD capture',
    featureDashboard:    'Dispatcher dashboard + live tracking',
    featureMultiDepot:   'Multi-depot support',
    featureFleetAnalytics: 'Fleet analytics + driver coaching',
    featureAdminPanel:  'Admin portal + full audit trail',
  },

  // ── Proof / About ────────────────────────────────────────────────────────────
  proof: {
    label:       'Built by drivers',
    founderQuote:'I drove a Sprinter for three years delivering to rural addresses in Oxfordshire and Warwickshire. I got stuck, took wrong turns, missed gates. That frustration is why MJ Maps exists.',
    founderAttr: 'Founder, MJ Maps Systems — former delivery driver',
    founded:     'Founded in {year} in the UK',
    foundedNote: 'Built by former delivery drivers. Not by Silicon Valley.',
    fact1:       'Community pin verification across 12,000+ delivery points',
    fact2:       'Average 23 minutes saved per route vs postcode-centroid routing',
    fact3:       'GREEN turn rate averages 74% across verified routes',
  },

  // ── Final CTA ───────────────────────────────────────────────────────────────
  finalCta: {
    headline: 'Start your 14-day free trial',
    sub:      'No card required. Works fully offline during the trial. Cancel anytime.',
    cta:      'Get started free →',
    ctaSecondary: 'Talk to sales',
  },

  // ── Drivers page ─────────────────────────────────────────────────────────────
  drivers: {
    heroLabel:    'For Drivers',
    heroHeadline: 'Your van. Your routes.\nYour gate pins.',
    heroSub:      'MJ Maps is built for the realities of UK delivery — narrow lanes, low bridges, farm gates, and dead mobile signal. Not generic sat-nav.',
    dayInLife: {
      label:   'A day on MJ Maps',
      heading: 'From first stop to last',
      stopsAdded:  'All your stops are in. Drag to reorder.',
      routeOptimised: 'Route optimised. 23 minutes faster than your usual order.',
      approaching: 'Approaching — turn-score: AMBER. Reduce to 12 mph.',
      gatePin:      'Gate pin confirmed. Plus Code: 7PQ7+23 Birmingham.',
      delivered:     'Delivered. Photo captured. Next stop: 0.4 miles.',
    },
    featuresLabel: 'Built for drivers',
    features: {
      turnScore: { heading: 'Turn-score: know before you turn', sub: 'GREEN / AMBER / RED chips on every junction. Tailored to your vehicle dimensions.' },
      gatePins:  { heading: 'Gate pins: never hunt for the gate again', sub: 'Community-verified delivery points with Plus Code. Works offline.' },
      offline:   { heading: 'Offline maps: rural dead zones don\'t stop you', sub: 'Full UK road network downloaded to your phone. No signal required.' },
      savedRoutes: { heading: 'Saved routes: your routes, ready to go', sub: 'Save and reuse common routes. One tap to load and start.' },
      pod:       { heading: 'POD capture: done in seconds', sub: 'Photo at the gate, geotagged. Auto-uploads when you\'re back in range.' },
      hud:       { heading: 'Driving HUD: eyes on the road', sub: 'Voice navigation with turn-score alerts. Designed for one-handed use.' },
    },
    ctaLabel:    'Start free — 14 days, no card needed',
    cta:         'Get started free →',
    pricingSnapLabel: 'Driver Pro',
    pricingSnapPrice: '£9.97',
    pricingSnapNote:  'per month. Cancel anytime. No auto-renew. VAT included.',
    reviewsLabel:     'Driver reviews',
  },

  // ── Fleet page ──────────────────────────────────────────────────────────────
  fleet: {
    heroLabel:    'For Fleet Operators',
    heroHeadline: 'Fleet visibility from\nfirst stop to last',
    heroSub:      'Dispatcher dashboard, live driver tracking, route assignment, and POD capture — for ops teams who care about ETA accuracy.',
    opsValue: {
      label:    'Operations value',
      heading:  'See everything. Act on what matters.',
      dispatch:  { heading: 'Live dispatch', sub: 'Assign routes to drivers from one screen. Broadcast changes mid-shift.' },
      tracking: { heading: 'Real-time tracking', sub: 'GPS pings every 10 seconds. See every driver\'s position, heading, and speed.' },
      alerts:   { heading: 'Turn alerts feed', sub: 'RED and AMBER turn alerts streamed live. Know when a driver encounters a tight junction.' },
      pod:      { heading: 'POD auto-capture', sub: 'Photos captured at every stop, auto-uploaded to the cloud. Ready for proof-of-delivery export.' },
    },
    featuresLabel: 'Enterprise features',
    features: {
      dashboard:  { heading: 'Dispatcher dashboard', sub: 'One screen for routes, drivers, alerts, and POD. No tab switching.' },
      tracking:   { heading: 'Live fleet tracking', sub: 'GPS stream at 10-second intervals. Heading arrow, speed, and last-seen on every driver.' },
      assignment: { heading: 'Route assignment', sub: 'Assign routes to drivers mid-shift. Broadcast changes to their app instantly.' },
      analytics:  { heading: 'Fleet analytics + driver coaching', sub: 'Quantified savings (time, fuel, risky turns avoided) per driver and fleet-wide. Driver coaching insights with improvement trend and fleet comparison.' },
      pod:       { heading: 'POD export + compliance', sub: 'All delivery photos geotagged, timestamped, and exportable. UK GDPR compliant.' },
      admin:     { heading: 'Admin portal + audit trail', sub: 'Full audit log of all admin actions, impersonation sessions, and feature flag changes.' },
    },
    compliance: {
      heading:  'UK GDPR. UK-hosted data. Your drivers\' data, protected.',
      sub:      'All data stored in UK data centres. Encryption in transit and at rest. Driver location data never sold or shared with third parties.',
    },
    ctaLabel:  'Talk to our team',
    cta:       'Book a demo →',
    pricingSnapLabel: 'Enterprise',
    pricingSnapNote:  'Custom pricing. No minimum commitment.',
  },

  // ── Features page ───────────────────────────────────────────────────────────
  featuresPage: {
    label:    'Features',
    headline: 'Everything a UK delivery driver needs',
    sub:      'Navigation that understands vans, HGVs, and the roads they drive on.',
    cta:      'Start free trial →',
  },

  // ── About page ──────────────────────────────────────────────────────────────
  about: {
    label:    'About',
    headline: 'Built by drivers.\nNot by Silicon Valley.',
    founderSection: {
      label:    'Our story',
      heading:  'Three years in a Sprinter. That\'s where MJ Maps came from.',
      sub:      'MJ Maps started with a delivery driver who got stuck on a farm track one too many times. Standard sat-nav had no idea that the actual gate was 400 metres from the postcode centroid, down a lane that a Luton van couldn\'t turn around in.\n\nWe built MJ Maps to solve that specific problem — and every other junction, gate, bridge, and dead-zone problem that comes with delivering to UK rural addresses.',
      quote:    '"I drove a Sprinter for three years. Every week I\'d get stuck, take a wrong turn, or miss a gate. That\'s why MJ Maps exists."',
      founder:  'James — Founder, MJ Maps Systems',
    },
    stats: {
      label:   'By the numbers',
      founded: 'Founded in {year} in the UK',
      pins:    'Community-verified gate pins',
      drivers: 'Active drivers',
      uptime:  'Uptime — last 90 days',
    },
    valuesLabel: 'What we believe',
    values: {
      driverFirst: { heading: 'Driver-first', sub: 'Every decision starts with: does this make a driver\'s day better or worse?' },
      honest:      { heading: 'Honest', sub: 'No fabricated stats. No exaggerated claims. We show our methodology.' },
      offline:     { heading: 'Offline-first', sub: 'Rural dead zones are a fact of UK delivery. Your tools shouldn\'t depend on signal.' },
      privacy:    { heading: 'Privacy by design', sub: 'Location data used for navigation only. Never sold. Never shared with third parties.' },
    },
  },

  // ── Contact page ─────────────────────────────────────────────────────────────
  contact: {
    label:    'Contact',
    headline: 'Talk to the team',
    sub:      'Questions about pricing, fleet plans, or the product? We reply personally — not by chatbot.',
    cta:      'Send message →',
  },

  // ── Pricing page ─────────────────────────────────────────────────────────────
  pricingPage: {
    label:    'Pricing',
    headline: 'Simple, honest pricing',
    sub:      'No setup fees. No per-stop charges. Cancel anytime — no auto-renew surprises. All prices include VAT.',
    cta:      'Start free trial →',
    compareLink: 'See full feature comparison →',
  },

  // ── Register page ───────────────────────────────────────────────────────────
  register: {
    label:    'Get started',
    headline: 'Start your free trial',
    sub:      '14 days free. No card required. Works fully offline from day one.',
    nameLabel:  'Your name',
    emailLabel: 'Email address',
    passwordLabel: 'Password (min. 8 characters)',
    planLabel:   'Choose your plan',
    planNavigation: 'Driver Pro',
    planEnterprise: 'Enterprise',
    submit:    'Create account →',
    loginLink: 'Already have an account? Sign in',
  },

  // ── Legal pages ──────────────────────────────────────────────────────────────
  privacy: {
    label:    'Privacy Policy',
    headline: 'Privacy Policy',
    lastUpdated: 'Last updated: January 2026',
  },

  terms: {
    label:    'Terms of Service',
    headline: 'Terms of Service',
    lastUpdated: 'Last updated: January 2026',
  },

  cookies: {
    label:    'Cookie Policy',
    headline: 'Cookie Policy',
    lastUpdated: 'Last updated: January 2026',
  },

  // ── Meta / SEO ───────────────────────────────────────────────────────────────
  meta: {
    homeTitle:       'MJ Maps — Delivery routing that knows your van',
    homeDescription:  'Turn-by-turn navigation for UK delivery drivers. Vehicle-aware routing, turn-score chips, exact gate-pin delivery — works fully offline.',
    driversTitle:    'MJ Maps for Drivers — Vehicle-aware navigation',
    driversDescription: 'Built for UK delivery drivers. Turn-score, gate pins, offline maps, and route optimisation.',
    fleetTitle:       'MJ Maps for Fleets — Fleet dispatcher dashboard',
    fleetDescription: 'Live fleet tracking, route assignment, POD capture, and analytics for UK delivery operations teams.',
    featuresTitle:   'Features — MJ Maps',
    featuresDescription: 'Turn-score, gate-pin delivery, offline maps, route optimisation, fleet tracking, POD capture.',
    pricingTitle:    'Pricing — MJ Maps',
    pricingDescription: 'Simple, honest pricing. £9.97/month for drivers. Custom pricing for fleets. Cancel anytime.',
    aboutTitle:      'About — MJ Maps',
    aboutDescription: 'Built by former delivery drivers in the UK. MJ Maps exists because standard sat-nav isn\'t built for vans, HGVs, and rural UK roads.',
    contactTitle:    'Contact — MJ Maps',
    contactDescription: 'Talk to the MJ Maps team. Questions about pricing, fleet plans, or the product.',
    securityTitle:   'Security & Privacy — MJ Maps',
    securityDescription: 'UK GDPR compliant. Data stored in UK data centres. Encryption in transit and at rest.',
  },

  // ── Errors / Fallbacks ───────────────────────────────────────────────────────
  errors: {
    notFound:    'Page not found',
    notFoundSub: 'The page you\'re looking for doesn\'t exist.',
    goHome:      'Go to homepage →',
  },
} as const;

export type TranslationKey = keyof typeof translations;

/**
 * Dot-notation lookup. Returns the value if found, or the path itself as a fallback.
 * Handles year interpolation via {year} placeholder.
 */
export function t(path: string, vars?: Record<string, string | number>): string {
  const keys = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let val: any = translations;
  for (const k of keys) {
    val = val?.[k];
    if (val === undefined) return path;
  }
  if (typeof val !== 'string') return path;
  if (!vars) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Like t() but renders HTML-safe content (passes through set:html).
 * Use only for trusted, user-controlled content where HTML is intended.
 */
export function tHtml(path: string, vars?: Record<string, string | number>): string {
  return t(path, vars);
}

export default translations;
