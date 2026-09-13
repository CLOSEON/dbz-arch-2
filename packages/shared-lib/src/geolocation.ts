/**
 * One way to ask for the device's position.
 *
 * Four call sites previously used `navigator.geolocation` directly. That works
 * in a desktop browser but is unreliable inside the Capacitor WebView, where
 * the native runtime permission has to be requested through the plugin first —
 * so GPS appeared to do nothing in the APK while working fine on the web.
 *
 * This prefers @capacitor/geolocation when running natively (it requests the
 * permission properly) and falls back to the browser API otherwise.
 */

export interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Why a position request failed, so callers can say something useful. */
export type GeoFailure =
  | 'unsupported'
  | 'permission-denied'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export class GeolocationError extends Error {
  constructor(public readonly reason: GeoFailure, message: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/** Human-readable text for each failure, pointing at the right remedy. */
export function geoErrorMessage(reason: GeoFailure): string {
  switch (reason) {
    case 'unsupported':
      return 'Location is not supported on this device.';
    case 'permission-denied':
      return 'Location permission was denied. Enable it for Dabzzo in your device settings.';
    case 'unavailable':
      return 'Could not get a location fix. Try moving somewhere with a clearer signal.';
    case 'timeout':
      return 'Locating took too long. Check that GPS is switched on and try again.';
    default:
      return 'Could not detect your location. Please enter the address manually.';
  }
}

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Map a browser PositionError code onto our reason union. */
function browserReason(code: number): GeoFailure {
  // 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
  if (code === 1) return 'permission-denied';
  if (code === 2) return 'unavailable';
  if (code === 3) return 'timeout';
  return 'unknown';
}

async function nativePosition(timeout: number): Promise<Coords> {
  const { Geolocation } = await import('@capacitor/geolocation');

  // Ask first. Without this the WebView silently fails on Android.
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location !== 'granted') {
      const asked = await Geolocation.requestPermissions();
      if (asked.location !== 'granted') {
        throw new GeolocationError('permission-denied', 'Location permission not granted');
      }
    }
  } catch (e) {
    if (e instanceof GeolocationError) throw e;
    // checkPermissions can throw on platforms that do not implement it;
    // fall through and let getCurrentPosition report the real problem.
  }

  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch (e) {
    const msg = String((e as { message?: string })?.message || e);
    if (/denied|permission/i.test(msg)) throw new GeolocationError('permission-denied', msg);
    if (/timeout|timed out/i.test(msg)) throw new GeolocationError('timeout', msg);
    throw new GeolocationError('unavailable', msg);
  }
}

function browserPosition(timeout: number): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError('unsupported', 'navigator.geolocation is unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new GeolocationError(browserReason(err.code), err.message || 'Geolocation failed')),
      { enableHighAccuracy: true, timeout }
    );
  });
}

/**
 * Current position, native-aware.
 *
 * Rejects with a GeolocationError carrying a `reason`, so callers can show
 * something specific rather than always blaming permissions.
 */
export async function getCurrentPosition(timeoutMs = 12000): Promise<Coords> {
  if (isNativePlatform()) {
    return nativePosition(timeoutMs);
  }
  return browserPosition(timeoutMs);
}
