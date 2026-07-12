# Rider Assignment (2km Logic) & Payment System — README

This document describes how riders are matched to vendors, how their pickup/drop routes are optimized, and how their pay is calculated. All references use canonical `order_id`, `batch_id`, and `rider_trip_id` from the core Order/Batch model.

---

## 1. Rider Assignment Logic (2km Radius)

### How a rider gets matched to vendors
1. The system continuously tracks each rider's live GPS location.
2. When one or more vendor **batches** are marked "ready" for pickup, the system looks for all such batches within a **2km radius** of a given rider's current location.
3. There is **no quadrant restriction** — the full 2km circular radius around the rider is searched for eligible vendor batches.
4. A single rider trip **may include orders from multiple vendors/batches**, as long as all of them fall within the 2km radius and the total tiffin count stays within the cap below.

### Hard cap
- A rider is **never assigned more than 20 tiffins** per trip, regardless of how many are available within radius.
- If fewer than 20 are available within 2km, the rider is assigned whatever is available — this trip is flagged internally as a "partial load" for reporting, not blocked.

### Route optimization — two distinct phases
**Phase 1: Pickup route**
- Once a trip's vendor batches are locked in, the system calculates the fastest route to visit all vendor pickup locations (TSP-style optimization — nearest-neighbor + 2-opt, or a routing API).
- Rider follows an ordered, turn-by-turn pickup sequence in-app.
- Each vendor pickup is confirmed via **OTP exchange** (vendor generates, rider enters) plus a **count confirmation** step (rider confirms actual tiffins received match the vendor's declared count). Mismatches are flagged to ops rather than silently dropped.

**Phase 2: Drop route**
- Once all pickups for the trip are confirmed, the system calculates the fastest and shortest route covering all drop (customer) locations, starting from the last pickup point.
- Rider follows this ordered drop sequence, confirming each delivery via OTP exchange with the customer.
- If a customer is unavailable at drop, the rider can mark it as such (short wait window, then move on) rather than holding up the rest of the route — this stop does **not** count toward the rider's paid tiffin-drop count (see payment rules below).

### Why 2km, not quadrant-based
An earlier version of this logic considered splitting a 20km radius into quadrants. This was dropped — **2km is the only radius that keeps trips profitable and deliveries fast**, since anything wider increases both fuel/time cost per trip and spoilage/delay risk for hot food.

---

## 2. Rider Payment Structure

### Base pay
**₹10 per km** traveled during the trip (sum of pickup-route distance + drop-route distance).

- Calculated from **actual GPS-tracked distance**, not just the planned/optimized route distance — this protects against underpayment from real-world detours (traffic, wrong turns) while also discouraging deliberate route padding, since GPS tracking makes discrepancies visible to ops.

### Tiffin count bonus
| Tiffins dropped        | Bonus                                   |
|--------------------------|-------------------------------------------|
| 1st–14th tiffin           | No bonus — base pay only                 |
| 15th tiffin onward         | +₹7 per additional tiffin dropped       |

**Example:** A rider who drops all 20 tiffins on a trip earns:
```
Base pay = ₹10 × total_km
Tiffin bonus = 6 extra tiffins (15th–20th) × ₹7 = ₹42
Total = Base pay + ₹42
```

- If fewer than 14 tiffins are dropped (partial load), **no bonus applies** — base pay only.
- Failed/undelivered drops (e.g. customer unavailable, order ultimately marked failed) **do not count** toward the tiffin total used for bonus calculation.

### Payment record
Every completed trip generates a `RiderPayment` record containing:
- `rider_trip_id`
- `total_distance_km`
- `base_payment`
- `tiffin_bonus`
- `total_payment`
- `calculated_at`

This calculation always runs on **real trip data** — no placeholder, hardcoded, or dummy values anywhere in the payment pipeline or rider-facing UI.

---

## 3. Live Display Requirements

All rider-facing and admin-facing screens must reflect **live data only**:
- Rider earnings screen: live running total for current trip, breakdown of base vs bonus, historical trip payments — no sample/mock figures.
- Trip screen: live tiffin count assigned/picked up/dropped, live GPS-based distance, live recalculated ETA per stop.
- Admin dashboard: active riders, tiffins in transit, average trip distance, average payment per rider — computed from live queries, not cached/mock data.

---

## 4. Key Design Decisions (why it works this way)

- **2km radius (not wider)** keeps delivery times short enough for hot food and keeps per-trip fuel/time cost profitable.
- **20-tiffin hard cap** protects food quality/temperature and keeps route complexity (and rider fatigue) manageable.
- **14-tiffin threshold before bonus kicks in** ensures riders are fairly paid at low volume via base pay alone, while rewarding riders who take on heavier, more efficient loads.
- **GPS-tracked distance (not planned route distance)** for payment balances fairness to riders against real-world conditions with fraud/abuse prevention for ops.
