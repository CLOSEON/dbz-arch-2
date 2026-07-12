# Swap, Skip & Credit System — README

One integrated system: Swap and Skip are the two ways a user's action generates a **credit**, and the Credit system is the single ledger that both feed into. This document treats all three as one mechanism rather than three separate features, since that's how they actually behave in the product.

All references use the canonical `order_id` — no order data is duplicated here.

---

## 1. The mechanism, in one sentence

> A user gives something up (their assigned meal, via swap or skip) → the system converts that action into a small fractional credit → credits accumulate into a single balance → at 1.0, a free meal voucher is generated → vouchers are redeemable only while subscribed.

Everything below is detail on that one sentence.

---

## 2. Swap

### What it does
User **A** doesn't want today's tiffin and offers to trade it with another subscriber **B** within 2km who has a different meal.

### Cost to A (initiator)
| Subscription plan | Free swaps / month | Cost after free swaps used |
|---|---|---|
| Lunch only | 1 | Rs 50 per swap |
| Lunch + Dinner | 2 | Rs 50 per swap |

- Rs 50 is charged **only on successful match** — never for the broadcast itself.
- If nobody accepts by the delivery cutoff, the company sources a fallback meal for A. If A's swap was paid, Rs 50 is still charged (company already absorbed the sourcing cost). If it was a free-allowance swap, no charge.

### Reward to B (acceptor) — this is where credit enters
- Every accepted swap earns B **0.3 credit**.
- This is B's only role in the transaction — B doesn't pay anything, just receives a different meal and a credit for the inconvenience.

### Constraints
| Rule | Value |
|---|---|
| Radius | Strictly 2km — never wider |
| Broadcast expiry | None — stays open until accepted or delivery cutoff hits |
| Initiation cutoff | 4 hours before delivery time — hard disable after |
| Broadcast recipients | Everyone within 2km whose meal differs from A's |

### Flow
1. A requests swap, system checks free allowance, sets is_paid accordingly.
2. Broadcast sent to all eligible users in 2km, each showing A's full meal details, and the nudge: "Accept this swap and earn 0.3 credits toward a free meal."
3. First acceptor wins, all other broadcasts marked expired.
4. Meals swapped between A and B for that order.
5. B credited 0.3 credit. If A was on a paid swap, A charged Rs 50 now.
6. If no acceptance by delivery cutoff, company-fulfilled, order marked accordingly, A charged Rs 50 only if it was a paid attempt.

### Critical sequencing rule
Swap resolution must finalize **before** vendor batch formation, which also happens at the 4-hour mark. Swap cutoff runs first (reject new attempts, resolve/expire pending ones), batch formation runs a moment after — never at the exact same instant, to avoid a race on which vendor an order belongs to.

---

## 3. Skip

### What it does
User skips today's meal entirely — no swap, no delivery.

### Reward — tiered by timing
| Timing | Credit |
|---|---|
| More than 12 hours before delivery | 0.5 |
| Less than 12 hours before delivery (still before delivery time) | 0.2 |
| At/after delivery time | N/A, too late, order already out |

### Key difference from swap
Skip has **no hard cutoff**. The button is always available up to delivery time — only the credit tier and the in-app copy change ("Skip now and earn 0.5 credits" then "Skip now and earn 0.2 credits"). This is intentional: skip doesn't need another person to participate, so there's no reason to lock it early the way swap is locked.

### Side effect on vendor batches
If skip happens after the vendor's batch has already formed (post 4hr mark), the order is removed from the batch's active count and a lightweight, debounced update is sent to the vendor (not one notification per skip, batched every 15-30 min or at a fixed checkpoint).

---

## 4. Credit — the shared ledger

### Sources feeding the same balance
| Action | Credit |
|---|---|
| Accept a swap (B) | 0.3 |
| Skip, more than 12hrs out | 0.5 |
| Skip, less than 12hrs out | 0.2 |

All three write to the **same per-user running balance** — the system doesn't care which source a credit came from once it's in the ledger, only the total matters for voucher generation.

### Conversion to vouchers
- Balance reaches 1.0 or more: auto-generate a **Free Meal Voucher**, deduct 1.0, carry over remainder.
  - Example: balance hits 1.3, 1 voucher issued, 0.3 remains toward the next one.
- Vouchers auto-apply to the user's next order unless the user opts to save it.

### Expiry and redemption — the one asymmetry in this system
| | Expires? | Redeemable when? |
|---|---|---|
| Credit balance | Never | N/A, it's not spent directly |
| Voucher | Never | Only while subscription is active |

If a subscription lapses, the balance/vouchers are **frozen, not forfeited** — nothing is ever deleted. On resubscription, everything becomes redeemable again automatically. UI should show: "You have X credits waiting, resubscribe to redeem them."

### User-visible fields (single screen)
- Current fractional balance
- Vouchers available now
- Progress bar/count toward next voucher
- Frozen-balance message if subscription is inactive

---

## 5. Guardrails (apply across swap, skip, and credit as one system)

- **Collusion limit**: same A-B pair capped at a small number of matched swaps within a rolling 30-day window, to blunt intentional back-and-forth credit farming.
- **Single audit trail**: every swap match, skip action, and credit/voucher event is logged with order_id, actor, timestamp, and amount, one trail, not three fragmented ones, so support can reconstruct any user's credit history from one query.
- **No silent state**: an order can never sit in "broadcasted" indefinitely without a defined resolution path (match, or company-fulfilled at cutoff), enforced by the same stuck-order safety net used elsewhere in the system.
- **Unit economics check**: since credits are ultimately funded by swap fees (Rs 50) and skip has no offsetting fee, periodically verify that the cost of issued vouchers doesn't exceed what paid swaps plus subscription margin can sustain. This isn't a rule to enforce in code, but a metric to watch on the admin dashboard.

---

## 6. Why it's designed this way (quick reference)

- **Small fractional credits (0.2/0.3/0.5)** instead of whole-meal rewards mean a free meal requires multiple genuine actions, not one lucky swap.
- **Swap locks early (4hr), skip doesn't** because swap needs another live participant and inventory certainty for the vendor; skip only needs the user's own decision.
- **Credits never expire, but redemption is subscription-gated** rewards honesty (nothing is ever taken away) while preventing "earn now, cash out after cancelling."
- **One ledger, three inputs** keeps the mental model simple for both users (single balance to track) and engineering (one place to query, one place to reconcile).
