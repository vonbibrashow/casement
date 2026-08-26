import { session, type Session } from 'electron'
import { getSettings } from '../settings'
import { hostOf, isTracker } from './trackers'

// Security hardening applied to every panel session.
//
// Scope, honestly: this is browser-level defence, not antivirus. It blocks
// known trackers, stops sites taking camera/microphone/location without
// consent, and refuses navigation schemes a web page has no business
// triggering. It cannot stop malware you choose to run, and the single
// biggest protection remains keeping Chromium patched — which is what the
// auto-updater is for.

/** Permissions a page must never get silently; each is user-controlled. */
const GATED = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'hid', 'serial', 'usb', 'idle-detection'])

/** Harmless enough to allow without a prompt. */
const ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'])

let blockedCount = 0
export const getBlockedCount = (): number => blockedCount
export const resetBlockedCount = (): void => {
  blockedCount = 0
}

// Re-exported so callers have one security entry point, while the guard itself
// stays Electron-free and unit-testable.
export { isPageNavigationAllowed } from './navigation'

const hardened = new Set<string>()

/**
 * Apply request filtering and permission gating to a panel's session. Safe to
 * call repeatedly — each partition is only wired once.
 */
export function hardenSession(partition: string): void {
  if (hardened.has(partition)) return
  hardened.add(partition)
  const ses: Session = session.fromPartition(partition)

  // --- tracker blocking ---
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!getSettings().blockTrackers) return callback({})
    // Never block the page the user actually asked for, only its subresources.
    if (details.resourceType === 'mainFrame') return callback({})
    if (isTracker(hostOf(details.url))) {
      blockedCount++
      return callback({ cancel: true })
    }
    callback({})
  })

  // --- device permissions ---
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(decidePermission(permission))
  })
  // Synchronous checks (e.g. a page probing whether it already has access)
  // must agree with the async handler, or sites see inconsistent state.
  ses.setPermissionCheckHandler((_wc, permission) => decidePermission(permission))

  // Deny the WebHID/WebSerial/WebUSB device pickers outright — there is no
  // legitimate reason for a page in this browser to reach hardware.
  ses.setDevicePermissionHandler(() => false)
}

function decidePermission(permission: string): boolean {
  const s = getSettings()
  if (ALLOWED.has(permission)) return true
  if (!GATED.has(permission)) return false // unknown permissions default closed
  switch (permission) {
    case 'media':
      return s.allowCameraMic
    case 'geolocation':
      return s.allowLocation
    case 'notifications':
      return s.allowNotifications
    default:
      return false
  }
}
