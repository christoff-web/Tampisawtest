> **Note:** this file describes an earlier round of work. Demo accounts, SQLite and camera features mentioned below have since been removed; see `CHANGES.md`.

# What was implemented, and what was tested

## How the existing UI was connected (UI design untouched)

Your React/Tailwind screens, styles, images, icons, routes and layout are the original files. Only the **data layer** changed:

| Before | Now |
|---|---|
| All data lived in the browser (`localStorage`), every account's data visible to every browser | Data lives in SQL Server; the browser only receives what the signed-in role may see |
| Login compared plain-text passwords in the browser | Server login with salted password hashes, HTTP-only session cookie, 6-try lock-out for 1 minute |
| Booking rules checked only in the browser | The same rules are enforced again on the server (browser checks stay for instant feedback) |
| Booking numbers, totals, QR tokens made by the browser | Made by the server; browser values are ignored |
| Rule-change history kept in `localStorage` | Read from the database audit log |

Small non-visual changes to the UI source: `store.tsx` (server-backed state), new `api.ts`, `guest.tsx` (login/sign-up/checkout wait
for the server's answer), `guest-privacy.tsx` (account deletion waits for the server), `admin.tsx` (demo-password card shows the three
known demo passwords because passwords are no longer stored readable), `admin-flow.tsx` (rule history from audit log), `data.ts`
(demo users removed from the browser). Two additions you did not have: a plain "Loading Tampisaw…" text while data loads and a
"Cannot reach the server – Try again" message if the server is down. Server rejections (for example "That cottage is already booked")
appear as a browser message.

## Features connected to the server (browser → API → database)

**Individually verified by the tests below:** sign-up/login/logout, account deletion, booking creation with server pricing, availability
(Tuesday, past dates, closures, capacity, cottage units, duplicate booking), proof upload, two-step payment verification, balance limits,
check-in, cancellation request + processing + freeing the space, incidents (guest limits), admin slot/closure/staff/settings changes, role
and ownership checks, privacy of other guests' data, the guest-to-staff-to-admin booking journey in a real browser, and every screen loading.
**Wired through the same tested path** (role check → server validation → AppStore → database) but *not* exercised one by one: walk-ins,
reschedule, bracelets, overtime, spot checks, sync queue, shift reports, pool logs, damage fees, maintenance requests, waitlist, weather
cancellations, policies, tariff, add-ons, lifeguard roster, bulk notifications.

* Sign-up, login, logout, guest self-service account deletion (blocked while paid upcoming bookings exist); admin deleting accounts.
* Create bookings: pool, cottage, room, event, with add-ons; guest-type pricing and discounts calculated on the server.
* Availability: closed Tuesdays, closures/blackouts, session capacity, cottage/room units, add-on daily stock, 10-minute checkout holds.
* **Conflict prevention:** capacity can't be exceeded, a cottage/room can't be double-booked for a date + session, a guest can't book the same session twice, cancelled bookings free the space again. All checks and the save run one request at a time (no race between two guests).
* View/manage bookings (guest "My bookings", staff appointments, admin lists), reschedule (with conflict check), check-in, no-show, cancellation requests, cancel/refund processing.
* Payments: QR/cash proof upload (JPG/PNG only), two-step verification (front desk approves, admin confirms), balance collection (cannot exceed the balance), receipts, refunds.
* Walk-ins, bracelets, time-out and overtime, spot checks, offline sync queue, shift reports, pool logs, damage fees.
* Incidents and maintenance requests (guests can only report, cancel or confirm their own).
* Waitlist (join/leave, automatic promotion when space opens).
* Admin: slots/capacity, cottages/rooms/prices, closures, weather cancellations, policies, booking rules, tariff, add-ons, ops config, staff accounts, lifeguard roster, notifications, audit log.
* Roles enforced on the server: guest, receptionist, administrator.

## Tests performed

| Test | Result |
|---|---|
| UI source type-check (`tsc`) and production build | passed |
| C# backend compile (.NET 10, ASP.NET Core) | passed, 0 errors / 0 warnings in the sandbox build |
| C# unit tests (xUnit tests in `tests/`): 53 existing + 12 new API-rule tests | 65 / 65 passed (run in the sandbox with a stand-in test runner) |
| End-to-end API suite (`tests/api_smoke_test.py`), real HTTP against the running server | 71 / 71 passed |
| Real-browser walk-through (headless Chromium): guest books with proof upload → confirmation page → data still there in a brand-new browser session → receptionist sees proof and sends to admin → admin confirms → guest sees *Confirmed / Paid / Official Receipt* → appointment list shows it | passed |
| Every screen opened as guest (7), receptionist (14), admin (32) with live data | 53 screens, 0 crashes |
| `01_Tampisaw_Schema.sql`: parsed as T-SQL; DDL executed in a scratch database; table and column lists compared with the app's model | 27 tables, 273 columns, 21 indexes, 0 mismatches |
| `02_Tampisaw_Queries.sql`: parsed as T-SQL, column names checked, availability/conflict logic run on sample rows | passed |

One real bug was found and fixed by the browser test (the confirmation page crashed on an extra `total` field in the guest-mix JSON).

## What was NOT tested (please read)

* **Nothing was run against a real Microsoft SQL Server.** The sandbox has no SQL Server and no NuGet access, so the Entity Framework / SQL Server layer
  (`src/Tampisaw.Web/Data`, from your earlier C# project, which had 54 passing tests in its original environment) was **not compiled or executed here**.
  The backend, API and tests above were compiled and run with that layer swapped for an in-memory store. First run on your machine is the real test of
  the database layer: if anything fails it will name the problem on start-up.
* The T-SQL scripts were syntax-checked and run only in a SQLite stand-in, not in SSMS.
* `Tampisaw.sln` and the NuGet restore were not opened in Visual Studio 2026 itself.
* No `FOREIGN KEY` constraints yet (see `docs/DATABASE.md`).
* Camera features (QR scan, selfie) and PDF export were not exercised by the headless browser.
* Email/SMS are still simulated in-app (as in the original prototype); no real mail is sent.
* Load/performance testing was not done; the design (one in-memory working copy, serialized writes) suits one resort, not thousands of users.
