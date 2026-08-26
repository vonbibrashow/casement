// Known tracking, analytics and ad-delivery hosts.
//
// Deliberately a curated list rather than a bundled filter subscription:
// EasyList and friends are GPL-licensed and multi-megabyte, which would both
// complicate this app's licensing and mean shipping rules nobody here has
// reviewed. This covers the large-scale collectors most pages carry.

const TRACKER_HOSTS = [
  // Analytics
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'segment.com',
  'segment.io',
  'mixpanel.com',
  'amplitude.com',
  'heap.io',
  'fullstory.com',
  'hotjar.com',
  'hotjar.io',
  'mouseflow.com',
  'crazyegg.com',
  'quantserve.com',
  'scorecardresearch.com',
  'chartbeat.com',
  'newrelic.com',
  'nr-data.net',
  'clarity.ms',
  'matomo.cloud',
  'statcounter.com',
  // Advertising / auctions
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  '2mdn.net',
  'adnxs.com',
  'adsrvr.org',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'sharethrough.com',
  'moatads.com',
  'adsafeprotected.com',
  'serving-sys.com',
  'bidswitch.net',
  'casalemedia.com',
  'smartadserver.com',
  'teads.tv',
  'yieldmo.com',
  // Cross-site social / behavioural pixels
  'connect.facebook.net',
  'facebook.net',
  'ads-twitter.com',
  'analytics.tiktok.com',
  'ads.linkedin.com',
  'bat.bing.com',
  'ads.yahoo.com',
  'branch.io',
  'appsflyer.com',
  'adjust.com',
  'kochava.com',
  'onesignal.com',
  'braze.com',
  'klaviyo.com',
  'intercomcdn.com'
]

const HOSTS = new Set(TRACKER_HOSTS)

/** Hostname, lowercased, without a leading www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * True when the host is a known tracker, or a subdomain of one — so
 * `metrics.doubleclick.net` matches without needing its own entry.
 */
export function isTracker(host: string): boolean {
  if (!host) return false
  if (HOSTS.has(host)) return true
  for (const t of HOSTS) {
    if (host.endsWith(`.${t}`)) return true
  }
  return false
}

export const TRACKER_COUNT = TRACKER_HOSTS.length
