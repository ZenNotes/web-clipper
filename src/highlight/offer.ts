// "Show highlights when you come back" needs access to every site, which
// the extension does not ask for at install. It is offered instead the first
// time a highlight is saved: once, whatever the answer. Ignoring the offer
// counts as Not now, so the decision to show it also records that it was
// shown.

import type { Settings } from '../shared/types'

export const PAGE_ORIGINS = ['http://*/*', 'https://*/*']

export interface OfferDecision {
  offer: boolean
  /** Settings to save when the offer is shown; null when nothing changes. */
  next: Settings | null
}

export function decideOffer(s: Settings, pageAccessGranted: boolean): OfferDecision {
  const h = s.highlighter
  if (h.restoreOnVisit || h.restoreOffered || pageAccessGranted) return { offer: false, next: null }
  return { offer: true, next: { ...s, highlighter: { ...h, restoreOffered: true } } }
}

export function acceptOffer(s: Settings): Settings {
  return { ...s, highlighter: { ...s.highlighter, restoreOnVisit: true, restoreOffered: true } }
}

/** Where the restore script runs: every site once the broad access is
 *  granted, else the sites access was granted for one by one (Firefox lets
 *  people allow single sites). */
export function restoreMatches(grantedOrigins: string[]): string[] {
  if (grantedOrigins.includes('<all_urls>') || PAGE_ORIGINS.every((o) => grantedOrigins.includes(o))) {
    return PAGE_ORIGINS
  }
  return grantedOrigins.filter((o) => /^(https?|\*):\/\/[^/]+\/.*$/.test(o) && o !== '<all_urls>')
}
