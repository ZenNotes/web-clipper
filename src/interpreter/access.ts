// What the Interpreter must be allowed before it sends a page anywhere: site
// access to the provider (every browser), and on Firefox the built-in data
// consent for website content, since the provider the person picked is a
// third party. Both go in one request, inside the click or key that runs the
// Interpreter: a second request after an await would no longer count as the
// person's action.

import type { Flavor } from '../shared/ext'

export const FIREFOX_DATA = ['websiteContent']

export type AccessRequest = chrome.permissions.Permissions & { data_collection?: string[] }

export function interpreterAccess(origin: string, flavor: Flavor): AccessRequest {
  return flavor === 'firefox' ? { origins: [origin], data_collection: FIREFOX_DATA } : { origins: [origin] }
}

export function refusalMessage(providerName: string, origin: string, flavor: Flavor): string {
  return flavor === 'firefox'
    ? `The Interpreter needs your OK to send this page to ${providerName}.`
    : `The clipper needs access to ${origin} to run the Interpreter.`
}
