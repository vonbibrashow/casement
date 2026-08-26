// Which URLs a *web page* is allowed to navigate itself to.
//
// Deliberately free of Electron imports so it stays a pure, directly testable
// function — this is a security boundary and it should be verifiable without
// standing up a browser.
//
// Anything outside this set is a page trying to reach somewhere it has no
// business going: `file://` reads local disk, `javascript:` injects script into
// the current document, and external protocol schemes (`ms-msdt:`, `steam:`,
// and friends) hand off to other applications on the machine.

const PAGE_SCHEMES = new Set(['http:', 'https:', 'about:'])

export function isPageNavigationAllowed(url: string): boolean {
  try {
    return PAGE_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false // unparseable is not navigable
  }
}
