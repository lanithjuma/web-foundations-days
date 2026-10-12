# TicketHub — System Design Document

TicketHub is a website that sells tickets for concerts and events. This document
applies the six-part design framework: requirements, estimates, API, data model,
architecture, and trade-offs.

## Given Facts

| Fact | Value |
|---|---|
| Registered users | 2,000,000 |
| Visitors on a normal day | 50,000 |
| Pages viewed per visitor | 10 |
| Tickets sold on a normal day | 5,000 |
| Attempted buyers for a popular concert sale | 200,000 |
| Seats available for that concert | 20,000 |
| Time window for the sale rush | 10 minutes (600 seconds) |

---

## 1. Requirements

### Functional Requirements
- Users can register and log in.
- Users can browse and search events (by name, artist, date, city).
- Users can view an event's details and its seat map, including which seats
  are available, held, or sold.
- Users can place a temporary **hold** on a seat while they complete checkout.
- Users can pay for their held seat(s) and receive a confirmed order.
- Users can view their purchased tickets / order history.

### Non-Functional Requirements
- **Speed**: Browsing pages (event list, event detail) should load in well
  under a second under normal load. Seat map data must be close to real-time
  so users aren't shown seats that are actually already taken.
- **Correctness**: This is the most important property of the whole system —
  **two people must never be able to buy the same seat.** Every other
  requirement can be relaxed before this one.
- **Fairness**: When many more people want seats than there are seats
  available (the big-sale case), access must be allocated in a way that
  doesn't reward whoever has the fastest script or the most aggressive
  auto-retrying browser tab. Everyone who arrives should get a fair,
  predictable chance, not a chaotic race.
- **Availability**: The system must stay up and keep serving requests during
  a 10-minute burst of 200,000 people, not fall over.
- **Durability**: Once a payment succeeds, the order and ticket must never be
  lost, even if a server crashes immediately afterward.
- **Scalability**: The system must handle roughly 300× its normal traffic
  for short, predictable bursts (ticket on-sales), without needing to be
  permanently provisioned at that size.
- **Security**: Payment details must be handled securely; TicketHub should
  not store raw card numbers (use a payment processor / tokenization).

---

## 2. Estimates

### Normal Traffic
- Page views/day = 50,000 visitors × 10 pages = **500,000 page views/day**
- Average browsing traffic = 500,000 ÷ 86,400 sec ≈ **5.8 requests/sec**
- Ticket sales/day = **5,000 tickets/day**
- Average ticket-sale rate = 5,000 ÷ 86,400 ≈ **0.058 tickets/sec** (about
  one sale every 17 seconds)
- Assuming a normal evening peak hour runs at roughly 3× the daily average
  (a typical diurnal pattern, not a special event), normal peak browsing
  traffic ≈ **17–18 requests/sec**.

### Big-Sale Peak
- 200,000 people try to buy 20,000 seats inside a 600-second window.
- Assuming each attempting user generates roughly 5 requests in that window
  (load the event page, load/refresh the seat map a couple of times, attempt
  a hold, submit payment):
  - Total requests ≈ 200,000 × 5 = **1,000,000 requests**
  - Average request rate ≈ 1,000,000 ÷ 600 ≈ **1,667 requests/sec**
- Seat-hold contention: 200,000 attempts chasing 20,000 seats means, on
  average, **10 people are competing for every seat**.
- Successful purchase rate: all 20,000 seats sell within the window ⇒
  ≈ 20,000 ÷ 600 ≈ **33 successful purchases/sec** at the moment of sale.
- The very first 30–60 seconds typically see a disproportionate share of
  that traffic (everyone refreshing at the exact on-sale time), so
  instantaneous peak request rate could realistically spike another 3–5×
  above the window average — on the order of **5,000–8,000 requests/sec**
  for a short burst.

### Comparison

| Metric | Normal | Big Sale | Multiple |
|---|---|---|---|
| Avg requests/sec | ~5.8 | ~1,667 | ~290× |
| Peak requests/sec | ~18 | ~5,000–8,000+ | ~300–450× |
| Ticket sales/sec | ~0.058 | ~33 | ~570× |

The takeaway: **normal traffic is modest and mostly reads** (people
browsing), while the big sale is a short, extreme burst that is both much
higher in volume *and* far more **write-contention-heavy** — many people are
racing to write ("I'll take this seat") to the same small set of rows at
once. The system has to be designed for that burst even though it's rare,
because that's precisely when correctness and fairness matter most.

---

## 3. API Design

All endpoints are versioned under `/api/v1`. Auth uses a bearer token
(JWT or session token) from login, required on all endpoints except browsing.

1. **`GET /api/v1/events?search=&city=&date=`**
   Browse/search events. Returns a paginated list of events with name,
   artist, venue, date, and a thumbnail.

2. **`GET /api/v1/events/{eventId}`**
   Get full details for one event (venue, date/time, description, price
   ranges).

3. **`GET /api/v1/events/{eventId}/seats`**
   Get the seat map for an event: every seat's section/row/number, price,
   and current status (`available`, `held`, `sold`). Used to render the
   interactive seat map.

4. **`POST /api/v1/events/{eventId}/seats/{seatId}/hold`**
   Attempt to place a short-lived hold on a specific seat for the
   logged-in user. Returns a `holdToken` and `expiresAt` (e.g., 5 minutes
   later) on success, or `409 Conflict` if the seat is no longer available.

5. **`POST /api/v1/orders`**
   Create an order: pay for one or more held seats. Body includes the
   `holdToken`(s) and payment details (or a payment-method token from the
   payment processor). Returns the created order and confirmed tickets, or
   an error if a hold expired before payment completed.

6. **`GET /api/v1/orders/{orderId}`**
   View a specific order's details and its ticket(s).

7. **`GET /api/v1/users/me/tickets`**
   List all tickets/orders belonging to the logged-in user (their purchase
   history).

---

## 4. Data Model

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID / BIGINT (PK) | |
| name | VARCHAR | |
| email | VARCHAR, UNIQUE | |
| password_hash | VARCHAR | |
| created_at | TIMESTAMP | |

### `events`
| Column | Type | Notes |
|---|---|---|
| id | UUID / BIGINT (PK) | |
| name | VARCHAR | e.g. "Artist X — World Tour" |
| venue_name | VARCHAR | (could be normalized into its own `venues` table) |
| venue_city | VARCHAR | |
| starts_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### `seats`
| Column | Type | Notes |
|---|---|---|
| id | UUID / BIGINT (PK) | |
| event_id | FK → events.id | |
| section | VARCHAR | |
| row | VARCHAR | |
| seat_number | VARCHAR | |
| price_cents | INTEGER | |
| status | ENUM('available','held','sold') | |
| held_by_user_id | FK → users.id, NULLABLE | |
| hold_expires_at | TIMESTAMP, NULLABLE | |
| version | INTEGER, DEFAULT 0 | optimistic-locking counter (see §5) |

**Constraint**: `UNIQUE (event_id, section, row, seat_number)` — guarantees
there is exactly one row representing each physical seat for each event, so
it's structurally impossible to accidentally create duplicate seat records.

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID / BIGINT (PK) | |
| user_id | FK → users.id | |
| event_id | FK → events.id | |
| status | ENUM('pending','paid','cancelled') | |
| total_cents | INTEGER | |
| created_at | TIMESTAMP | |
| paid_at | TIMESTAMP, NULLABLE | |

### `order_seats` (join table)
| Column | Type | Notes |
|---|---|---|
| id | UUID / BIGINT (PK) | |
| order_id | FK → orders.id | |
| seat_id | FK → seats.id, **UNIQUE** | |

**Constraint**: `UNIQUE (seat_id)` on `order_seats` — a seat can appear in
at most one order, ever. This is a second, independent layer of protection
against double-booking, on top of the `seats.status` state machine.

### Relationships
- `users` 1 — N `orders`
- `events` 1 — N `seats`
- `events` 1 — N `orders`
- `orders` 1 — N `order_seats`
- `seats` 1 — 0..1 `order_seats` (a seat is sold at most once)

---

## 5. Preventing Double-Booking

Double-booking happens when two concurrent requests both believe a seat is
available and both proceed to sell it. The naive approach — "check the seat's
status with a `SELECT`, and if it's available, send a separate `UPDATE`" — has
a race condition: two requests can both run the `SELECT` and both see
`available` *before either one's `UPDATE` has happened*. TicketHub avoids
this by making the check-and-claim a single atomic database operation instead
of two separate steps.

**Step 1 — Holding a seat (atomic conditional update):**
```sql
UPDATE seats
SET status = 'held',
    held_by_user_id = :userId,
    hold_expires_at = NOW() + INTERVAL '5 minutes',
    version = version + 1
WHERE id = :seatId
  AND status = 'available';
```
This single `UPDATE` only succeeds (affects 1 row) if the seat was still
`available` at the exact moment the database applied it. The database
guarantees that concurrent writes to the same row are serialized — if two
users hit "hold" on the same seat at the same instant, the database processes
one `UPDATE` first; by the time the second one runs, `status` is no longer
`'available'`, so it affects 0 rows. The application checks the number of
rows updated: 1 means "you got it," 0 means "sorry, just taken" (`409`).

**Step 2 — Paying (a single transaction):**
```sql
BEGIN;

UPDATE seats
SET status = 'sold'
WHERE id = :seatId
  AND status = 'held'
  AND held_by_user_id = :userId
  AND hold_expires_at > NOW();

-- if 0 rows affected above, ROLLBACK and tell the user their hold expired

INSERT INTO orders (...) VALUES (...);
INSERT INTO order_seats (order_id, seat_id) VALUES (...);

COMMIT;
```
Wrapping the final seat update, the order creation, and the `order_seats`
insert in one transaction means they all succeed together or all fail
together — there's no window where an order exists without its seat being
marked sold, or vice versa.

**Belt and suspenders**: the `UNIQUE` constraint on `order_seats.seat_id`
means even if application logic had a bug, the database itself would reject
a second `INSERT` trying to attach the same seat to a second order. The
`UNIQUE (event_id, section, row, seat_number)` constraint on `seats` prevents
duplicate seat rows from ever being created in the first place.

**Expired holds**: a background job (or a check performed whenever a seat is
read) releases seats whose `hold_expires_at` has passed back to `available`,
so a seat abandoned mid-checkout doesn't stay locked forever.

---

## 6. Architecture

```
                              ┌──────────────┐
                              │   Clients     │
                              └──────┬───────┘
                                     │
                            ┌────────▼─────────┐
                            │   CDN / Static    │  (event images, JS/CSS)
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │  Virtual Waiting   │  (admits users at a
                            │  Room / Queue      │   controlled rate during
                            └────────┬─────────┘   a big on-sale)
                                     │
                            ┌────────▼─────────┐
                            │  Load Balancer     │
                            └────────┬─────────┘
                                     │
                     ┌───────────────▼────────────────┐
                     │   API / App Servers (stateless)  │  ← auto-scales
                     └───┬───────────────────────┬────┘
                         │                        │
              ┌──────────▼─────────┐   ┌──────────▼──────────┐
              │  Cache (Redis)      │   │  Payment Gateway      │
              │  event/seat reads   │   │  (external, e.g.      │
              └──────────┬─────────┘   │  Stripe)               │
                         │              └──────────────────────┘
              ┌──────────▼─────────┐
              │  Read Replica(s)    │  (browsing/search traffic)
              └──────────┬─────────┘
                         │
              ┌──────────▼─────────┐
              │  Primary Database    │  ← single source of truth for
              │  (seats, orders,     │     seat holds/sales; all writes
              │  users, events)      │     go here
              └──────────┬─────────┘
                         │
              ┌──────────▼─────────┐
              │  Message Queue       │  (order confirmed events)
              └──────────┬─────────┘
                         │
              ┌──────────▼─────────┐
              │  Worker(s)            │  (send confirmation email,
              │                        │   generate ticket PDF/QR code)
              └────────────────────┘
```

### Component Explanations
- **CDN**: Serves static assets (images, JS, CSS) from edge locations so
  the app servers don't have to handle that load.
- **Virtual Waiting Room / Queue**: Admits users into the purchase flow at a
  rate the backend can safely handle, turning an uncontrolled 200,000-person
  stampede into a smooth, ordered stream — this is also the main fairness
  mechanism, since admission order (not script speed) determines who gets a
  chance first.
- **Load Balancer**: Spreads incoming requests across many app servers and
  routes around any server that goes down.
- **API / App Servers**: Stateless servers handling authentication, business
  logic, and routing; being stateless lets them scale out horizontally just
  by adding more instances.
- **Cache (Redis)**: Serves frequently-read, slightly-stale-tolerant data
  (event listings, seat map display) fast, without hitting the database for
  every page view.
- **Read Replica(s)**: Absorb heavy browsing/search read traffic so that
  load doesn't compete with the critical write traffic (holds and sales) on
  the primary database.
- **Primary Database**: The single authoritative source of truth for seat
  state, orders, users, and events; every hold and sale is written here, and
  its transactional guarantees are what actually prevent double-booking.
- **Payment Gateway**: An external, specialized service that handles
  payment processing and card data, so TicketHub never stores raw card
  numbers.
- **Message Queue + Workers**: Handle non-critical follow-up work (sending
  confirmation emails, generating ticket PDFs/QR codes) asynchronously, so
  that work doesn't slow down or risk the core seat-reservation transaction.

### Surviving the Big Sale
- The **waiting room** absorbs the 200,000-person burst at the edge and
  releases users into the system at a pace matching backend capacity, so
  the database never has to face 200,000 simultaneous hold attempts at once.
- **Auto-scaling, stateless app servers** behind the load balancer scale out
  to handle the elevated (but now-smoothed) request volume.
- **Caching and read replicas** absorb the flood of seat-map page loads and
  refreshes, keeping that read load off the primary database.
- The **primary database stays the bottleneck by design** — it only ever
  does small, fast, atomic operations (the conditional `UPDATE` described in
  §5), so even under heavy contention it can process holds/sales quickly and
  correctly rather than being overwhelmed by read traffic competing for the
  same resources.
- **Async workers** take confirmation emails and PDF generation off the
  critical path, so a slow email provider can never delay or block someone's
  actual seat purchase.

---

## 7. Trade-offs

1. **Virtual waiting room: fairness/stability vs. added complexity.**
   The waiting room is essential during a big on-sale (it's the main
   fairness mechanism and what keeps the database from being overwhelmed),
   but it adds real engineering complexity and a small amount of latency
   that exists year-round, even though it's only truly needed during rare
   on-sale spikes. We accept this because the cost of *not* having it (an
   unfair, crash-prone on-sale) is far worse than the ongoing cost of
   maintaining it.

2. **Short hold TTL: seat availability vs. user experience.**
   A short hold (e.g., 5 minutes) quickly frees up a seat if a user abandons
   checkout, which matters enormously during high contention — but it can
   frustrate a legitimate, slightly slow user who gets bumped mid-checkout.
   A longer hold is kinder to that user but keeps a seat artificially
   unavailable to everyone else for longer, which is less fair during a
   big sale. We lean toward a shorter TTL specifically *because* fairness
   is an explicit non-functional requirement.

3. **Caching seat-map reads: scalability vs. perfect real-time accuracy.**
   Caching the seat map dramatically reduces database read load and keeps
   browsing fast, but it means a user can occasionally see a seat marked
   "available" for a second or two after someone else has actually taken
   it. This is an acceptable trade because the *authoritative* check always
   happens at write time (the atomic `UPDATE` in §5) — the cache only
   affects what's displayed, never what's actually sold, so correctness is
   never compromised, only the freshness of the seat map display.
