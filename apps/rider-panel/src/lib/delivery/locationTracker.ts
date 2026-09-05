import { doc, updateDoc, setDoc, increment, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateDriverLocation } from '@/lib/queries/delivery';
import { Geolocation } from '@capacitor/geolocation';

class LocationTrackerService {
  private watchId: string | null = null;
  private currentDriverId: string | null = null;
  private activeSubscribers: number = 0;
  
  // Throttle states
  private lastWriteTime = 0;
  private lastWriteCoords: { lat: number; lng: number } | null = null;

  // Constants - OPTIMIZED for reduced writes
  private readonly DISTANCE_THRESHOLD_METERS = 50;   // Increased from 20 (2.5x less writes)
  private readonly TIME_THRESHOLD_MS = 30000;        // Increased from 15s (2x less writes)

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

    this.activeSubscribers++;

    if (this.currentDriverId === driverId && (this.watchId !== null || this.isStarting)) {
      if (onUpdate) {
        this.onLocationUpdate = onUpdate;
        if (this.lastWriteCoords) {
           onUpdate(this.lastWriteCoords.lat, this.lastWriteCoords.lng);
        }
      }
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
            console.warn('[LocationTracker] Geolocation error (watchPosition):', err.message || JSON.stringify(err));
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
            const distanceTraveled = this.lastWriteCoords
              ? this.haversineDistance(
                  this.lastWriteCoords.lat,
                  this.lastWriteCoords.lng,
                  latitude,
                  longitude
                )
              : 0;

            this.lastWriteCoords = { lat: latitude, lng: longitude };
            this.lastWriteTime = now;

            try {
              await updateDriverLocation(driverId, latitude, longitude);

              // Accumulate GPS distance on the active rider_trip (fraud-resistant, server-side cross-check)
              if (distanceTraveled > 0 && driverId) {
                const tripSnap = await getDocs(
                  query(
                    collection(db, 'rider_trips'),
                    where('riderId', '==', driverId),
                    where('status', 'in', ['picking_up', 'pickup_complete', 'dropping'])
                  )
                );
                if (!tripSnap.empty) {
                  const tripRef = doc(db, 'rider_trips', tripSnap.docs[0].id);
                  await updateDoc(tripRef, {
                    gpsDistanceKm: increment(distanceTraveled / 1000), // convert m → km
                  });
                }
              }
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

  public async stopTracking(force: boolean = false): Promise<void> {
    if (typeof window === 'undefined') return;

    if (!force) {
      this.activeSubscribers = Math.max(0, this.activeSubscribers - 1);
      if (this.activeSubscribers > 0) {
        return; // Still in use by another mounted component
      }
    } else {
      this.activeSubscribers = 0; // Force reset
    }

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
      const driverId = this.currentDriverId;
      try {
        await setDoc(doc(db, 'driver_profiles', driverId), {
          isActive: false,
          uid: driverId
        }, { merge: true });
        console.log(`[LocationTracker] Driver ${driverId} set to inactive.`);
      } catch (err) {
        console.error('[LocationTracker] Failed to mark driver inactive:', err);
      } finally {
        this.currentDriverId = null;
      }
    }
  }

  public async stopTripTracking(force: boolean = false): Promise<void> {
    return this.stopTracking(force);
  }
}

export const LocationTracker = new LocationTrackerService();
