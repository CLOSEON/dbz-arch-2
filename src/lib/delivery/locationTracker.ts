import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateDriverLocation } from '@/lib/queries/delivery';
import { Geolocation } from '@capacitor/geolocation';

class LocationTrackerService {
  private watchId: string | null = null;
  private currentDriverId: string | null = null;
  
  // Throttle states
  private lastWriteTime = 0;
  private lastWriteCoords: { lat: number; lng: number } | null = null;

  // Constants
  private readonly DISTANCE_THRESHOLD_METERS = 20;
  private readonly TIME_THRESHOLD_MS = 15000; // 15 seconds

  public haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async requestPermissions(): Promise<boolean> {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') return true;

      const request = await Geolocation.requestPermissions();
      return request.location === 'granted';
    } catch (err) {
      console.error('[LocationTracker] Permission request failed:', err);
      return false;
    }
  }

  private isStarting: boolean = false;
  private onLocationUpdate?: (lat: number, lng: number) => void;

  public async startTracking(
    driverId: string, 
    name?: string, 
    phone?: string,
    onUpdate?: (lat: number, lng: number) => void
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.watchId !== null || this.isStarting) {
      console.warn('[LocationTracker] Tracking is already active or starting.');
      return;
    }

    this.isStarting = true;
    this.currentDriverId = driverId;
    this.lastWriteTime = 0;
    this.lastWriteCoords = null;
    if (onUpdate) {
      this.onLocationUpdate = onUpdate;
    }

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Geolocation permission denied by the user.');
      }

      // If stopTracking was called while we were waiting for permissions, abort!
      if (this.currentDriverId !== driverId) {
        this.isStarting = false;
        return;
      }

      // Mark driver as active on the fleet instantly with their details
      await setDoc(doc(db, 'driver_profiles', driverId), {
        isActive: true,
        uid: driverId,
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {})
      }, { merge: true });

      // Configure position listeners using Capacitor
      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
        async (position, err) => {
          if (err) {
            console.error('[LocationTracker] Geolocation error:', err);
            return;
          }
          if (!position) return;

          const { latitude, longitude } = position.coords;
          if (this.onLocationUpdate) {
            this.onLocationUpdate(latitude, longitude);
          }
          const now = Date.now();

          let shouldWrite = false;

          if (!this.lastWriteCoords || this.lastWriteTime === 0) {
            shouldWrite = true;
          } else {
            const distanceDelta = this.haversineDistance(
              this.lastWriteCoords.lat,
              this.lastWriteCoords.lng,
              latitude,
              longitude
            );
            const timeDelta = now - this.lastWriteTime;

            if (
              distanceDelta >= this.DISTANCE_THRESHOLD_METERS ||
              timeDelta >= this.TIME_THRESHOLD_MS
            ) {
              shouldWrite = true;
            }
          }

          if (shouldWrite) {
            this.lastWriteCoords = { lat: latitude, lng: longitude };
            this.lastWriteTime = now;

            try {
              await updateDriverLocation(driverId, latitude, longitude);
            } catch (err) {
              console.error('[LocationTracker] Update failed:', err);
            }
          }
        }
      );

      this.isStarting = false;
      console.log('[LocationTracker] Fleet geolocation tracking initiated successfully.');
    } catch (err) {
      this.isStarting = false;
      console.error('[LocationTracker] Failed to start tracking service:', err);
    }
  }

  public async stopTracking(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.watchId !== null) {
      try {
        await Geolocation.clearWatch({ id: this.watchId });
        console.log('[LocationTracker] Watch position listener cleared.');
      } catch (err) {
        console.error('[LocationTracker] Failed to clear geolocation watch:', err);
      } finally {
        this.watchId = null;
      }
    }

    if (this.currentDriverId) {
      try {
        await setDoc(doc(db, 'driver_profiles', this.currentDriverId), {
          isActive: false,
          uid: this.currentDriverId
        }, { merge: true });
        console.log(`[LocationTracker] Driver ${this.currentDriverId} set to inactive.`);
      } catch (err) {
        console.error('[LocationTracker] Failed to mark driver inactive:', err);
      } finally {
        this.currentDriverId = null;
      }
    }
  }
}

export const LocationTracker = new LocationTrackerService();
