import { session, type Session } from 'electron'
import type { GatedPermission } from '@shared/types'
import { getSettings } from '../settings'
import { hostOf, isTracker } from './trackers'
import { decide, decideSync } from './permissions'

// Security hardening applied to every panel session.
//
// Scope, honestly: this is browser-level defence, not antivirus. It blocks
// known trackers, stops sites taking camera/microphone/location without
// consent, and refuses navigation schemes a web page has no business
// triggering. It cannot stop malware you choose to run, and the single
// biggest protection remains keeping Chromium patched — which is what the
// auto-updater is for.

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
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALLOWED.has(permission)) return callback(true)
    const kind = gatedKind(permission)
    if (!kind) return callback(false) // unknown permissions default closed
    const url = details?.requestingUrl || wc?.getURL() || ''
    void decide(url, kind).then(callback)
  })
  // Synchronous checks (a page probing whether it already has access) can't
  // prompt, so they report only what's already settled.
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    if (ALLOWED.has(permission)) return true
    const kind = gatedKind(permission)
    if (!kind) return false
    return decideSync(requestingOrigin || wc?.getURL() || '', kind)
  })

  // Deny the WebHID/WebSerial/WebUSB device pickers outright — there is no
  // legitimate reason for a page in this browser to reach hardware.
  ses.setDevicePermissionHandler(() => false)
}

/** Map Chromium's permission names onto the kinds we prompt about. */
function gatedKind(permission: string): GatedPermission | null {
  switch (permission) {
    case 'media':
    case 'audioCapture':
    case 'videoCapture':
      return 'camera-mic'
    case 'geolocation':
      return 'location'
    case 'notifications':
      return 'notifications'
    default:
      return null
  }
}
