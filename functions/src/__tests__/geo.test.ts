import { getDistanceInKm } from '../utils/geo';

/**
 * getDistanceInKm underpins the 2 km rider-dispatch radius, which is the rule
 * that keeps food hot between kitchen and customer. It had no tests.
 */
describe('Geo distance (dispatch radius)', () => {
  // Two points ~1.11 km apart: 0.01 degrees of latitude is 1/100th of a degree,
  // and one degree of latitude is ~111.19 km everywhere on the globe.
  const NOIDA = { lat: 28.6139, lng: 77.209 };

  test('distance from a point to itself is zero', () => {
    expect(getDistanceInKm(NOIDA.lat, NOIDA.lng, NOIDA.lat, NOIDA.lng)).toBe(0);
  });

  test('0.01 degrees of latitude is about 1.11 km', () => {
    const d = getDistanceInKm(NOIDA.lat, NOIDA.lng, NOIDA.lat + 0.01, NOIDA.lng);
    expect(d).toBeCloseTo(1.11, 2);
  });

  test('is symmetric — order of the two points does not matter', () => {
    const a = getDistanceInKm(28.6139, 77.209, 28.7041, 77.1025);
    const b = getDistanceInKm(28.7041, 77.1025, 28.6139, 77.209);
    expect(a).toBeCloseTo(b, 10);
  });

  test('a degree of longitude shrinks as you move away from the equator', () => {
    const atEquator = getDistanceInKm(0, 0, 0, 1);
    const atNoida = getDistanceInKm(28.6139, 77.0, 28.6139, 78.0);
    expect(atEquator).toBeCloseTo(111.19, 1);
    expect(atNoida).toBeLessThan(atEquator);
    // cos(28.6139 deg) ~= 0.8778
    expect(atNoida).toBeCloseTo(111.19 * Math.cos((28.6139 * Math.PI) / 180), 0);
  });

  test('known city pair: Delhi to Noida is roughly 20 km', () => {
    // Connaught Place -> Noida Sector 62
    const d = getDistanceInKm(28.6315, 77.2167, 28.6274, 77.3716);
    expect(d).toBeGreaterThan(14);
    expect(d).toBeLessThan(18);
  });

  // ─── The dispatch rule itself ────────────────────────────────────────────
  describe('2 km dispatch threshold', () => {
    const RADIUS_KM = 2.0;
    const kitchen = { lat: 28.6139, lng: 77.209 };

    test('a rider ~1.1 km away is inside the radius', () => {
      const d = getDistanceInKm(kitchen.lat, kitchen.lng, kitchen.lat + 0.01, kitchen.lng);
      expect(d).toBeLessThan(RADIUS_KM);
    });

    test('a rider ~3.3 km away is outside the radius', () => {
      const d = getDistanceInKm(kitchen.lat, kitchen.lng, kitchen.lat + 0.03, kitchen.lng);
      expect(d).toBeGreaterThan(RADIUS_KM);
    });

    test('the boundary sits between 0.017 and 0.019 degrees of latitude', () => {
      const inside = getDistanceInKm(kitchen.lat, kitchen.lng, kitchen.lat + 0.017, kitchen.lng);
      const outside = getDistanceInKm(kitchen.lat, kitchen.lng, kitchen.lat + 0.019, kitchen.lng);
      expect(inside).toBeLessThan(RADIUS_KM);
      expect(outside).toBeGreaterThan(RADIUS_KM);
    });
  });

  test('handles the antimeridian without returning NaN', () => {
    const d = getDistanceInKm(0, 179.9, 0, -179.9);
    expect(Number.isNaN(d)).toBe(false);
    // 0.2 degrees at the equator
    expect(d).toBeCloseTo(22.24, 1);
  });

  test('handles poles without returning NaN', () => {
    const d = getDistanceInKm(90, 0, -90, 0);
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(20015, 0); // half the earth's circumference
  });
});
