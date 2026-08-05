// Selective "forget on exit": drop cookies/storage/history for chosen sites at
// shutdown while leaving everything else intact, so signed-in shopping and
// banking sessions survive and don't have to be re-verified every time.

import type { PrivacyRules } from '@shared/types'

export type { PrivacyRules }

export const DEFAULT_RULES: PrivacyRules = {
  enabled: false,
  clearAdult: true,
  forgetDomains: [],
  // Seeded with common payment/banking hosts so an over-broad keyword can never
  // log the user out of something that matters.
  keepDomains: ['paypal.com', 'stripe.com', 'shopify.com', 'amazon.com', 'ebay.com', 'klarna.com', 'afterpay.com'],
  clearHistory: true
}

/**
 * Substrings that identify adult sites without needing to ship an exhaustive
 * blocklist. Matched against the hostname only.
 */
const ADULT_PATTERNS = ['porn', 'xxx', 'xnxx', 'xvideos', 'pornhub', 'redtube', 'youporn', 'brazzers', 'onlyfans', 'hentai', 'nsfw', 'camsoda', 'chaturbate', 'stripchat', 'adultfriend', 'escort', 'fetish']

/** Hostname of a URL, lowercased; '' when the URL is unparseable. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** True when `host` is `domain` or a subdomain of it. */
function matchesDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, '').trim()
  if (!d) return false
  return host === d || host.endsWith(`.${d}`)
}

export function isAdultHost(host: string): boolean {
  return ADULT_PATTERNS.some((p) => host.includes(p))
}

/**
 * Should this host be forgotten? The keep-list is checked first and always
 * wins, so a broad keyword match can never take out a site the user protected.
 */
export function shouldForget(host: string, rules: PrivacyRules): boolean {
  if (!host) return false
  if (rules.keepDomains.some((d) => matchesDomain(host, d))) return false
  if (rules.clearAdult && isAdultHost(host)) return true
  return rules.forgetDomains.some((d) => matchesDomain(host, d))
}

/** Every host that would be forgotten out of a set of visited hosts. */
export function partitionHosts(hosts: string[], rules: PrivacyRules): { forget: string[]; keep: string[] } {
  const forget: string[] = []
  const keep: string[] = []
  for (const h of hosts) (shouldForget(h, rules) ? forget : keep).push(h)
  return { forget, keep }
}
