/* =====================================================================================
   TAMPISAW SYSTEM  -  Reference queries (SQL Server / SSMS)
   File : 02_Tampisaw_Queries.sql          Run AFTER Tampisaw.SqlServer.sql and after the app
                                           has started once (so the tables contain data).

   What this file is
     * The T-SQL equivalent of what each part of the system does with the database:
       availability, conflict detection, bookings, payments, accounts, reports, audit trail.
     * Read-only views (section 1) and ready-to-use SELECT queries you can run in SSMS.
     * A few UPDATE examples (section 7) marked "MANUAL FIX" for administrators.

   How the application uses the database (important)
     The ASP.NET Core app loads the data from these tables when it starts, applies every
     change in memory under a lock (this is how "check availability, then book" cannot race),
     and writes each change straight back to these tables in one transaction.
     => Reading with SELECT while the app runs is always fine.
     => Changing rows by hand (UPDATE/DELETE) while the app runs is NOT picked up until the
        app is restarted, and the app may write its own version over yours. Stop the app
        before doing manual fixes.

   Conventions in this schema
     * Dates are stored as text 'yyyy-MM-dd' (so they sort and compare correctly as text).
     * Times such as CreatedAt are ISO-8601 UTC text, e.g. '2026-10-20T03:32:46.673Z'.
     * A booking "holds" a place unless Status is 'cancelled', 'no-show' or 'expired'.
     * SlotId values: 'day-tour', 'night-swim', 'room-stay', 'event'.
     * Status values: pending, reserved, confirmed, checked-in, checked-out, completed,
       cancellation-requested, cancelled, no-show, expired.
   ===================================================================================== */
USE [Tampisaw];
GO

/* ===================================================================================
   1. VIEWS
   =================================================================================== */

-- Bookings that currently hold capacity / a cottage (the same rule the app uses).
CREATE OR ALTER VIEW dbo.vw_ActiveBookings AS
SELECT b.*
FROM dbo.Bookings AS b
WHERE b.Status NOT IN (N'cancelled', N'no-show', N'expired');
GO

-- Head-count per date and session versus the session capacity.
CREATE OR ALTER VIEW dbo.vw_SlotOccupancy AS
SELECT  b.[Date],
        s.Id        AS SlotId,
        s.Label     AS SlotLabel,
        s.Capacity,
        SUM(b.Guests)                        AS BookedGuests,
        s.Capacity - SUM(b.Guests)           AS SpotsLeft
FROM dbo.vw_ActiveBookings AS b
JOIN dbo.Slots AS s ON s.Id = b.SlotId
GROUP BY b.[Date], s.Id, s.Label, s.Capacity;
GO

-- Which cottage / room / pavilion is taken on which date and session.
CREATE OR ALTER VIEW dbo.vw_CottageUsage AS
SELECT  b.[Date], b.SlotId, c.Id AS CottageId, c.Name AS CottageName, c.Kind, c.Units,
        COUNT(*) AS UnitsTaken, c.Units - COUNT(*) AS UnitsLeft
FROM dbo.vw_ActiveBookings AS b
JOIN dbo.Cottages AS c ON c.Id = b.CottageId
GROUP BY b.[Date], b.SlotId, c.Id, c.Name, c.Kind, c.Units;
GO

/* ===================================================================================
   2. CHECK AVAILABILITY  (guest booking page, walk-in page)
   =================================================================================== */
DECLARE @Date   nvarchar(10) = N'2026-10-23';
DECLARE @Slot   nvarchar(64) = N'day-tour';
DECLARE @Guests int          = 5;

-- 2a. Is the resort open? (closed Tuesdays + closures/blackouts for that date or session)
SELECT CASE WHEN DATENAME(WEEKDAY, CONVERT(date, @Date)) = N'Tuesday' THEN 1 ELSE 0 END AS ClosedTuesday,
       (SELECT COUNT(*) FROM dbo.Blackouts
         WHERE [Date] = @Date AND (SlotId IS NULL OR SlotId = N'' OR SlotId = @Slot)) AS ClosuresThatDay;

-- 2b. Spots left in the session, and whether @Guests fit.
SELECT s.Id, s.Label, s.Capacity,
       COALESCE(SUM(b.Guests), 0)                       AS Booked,
       s.Capacity - COALESCE(SUM(b.Guests), 0)          AS SpotsLeft,
       CASE WHEN COALESCE(SUM(b.Guests), 0) + @Guests <= s.Capacity AND s.Active = 1
            THEN 1 ELSE 0 END                           AS Fits
FROM dbo.Slots AS s
LEFT JOIN dbo.vw_ActiveBookings AS b ON b.SlotId = s.Id AND b.[Date] = @Date
WHERE s.Id = @Slot
GROUP BY s.Id, s.Label, s.Capacity, s.Active;

-- 2c. Cottages / rooms / pavilions that are still free for that date and session.
SELECT c.Id, c.Name, c.Kind, c.Capacity, c.Price,
       c.Units - COALESCE(u.UnitsTaken, 0) AS UnitsLeft
FROM dbo.Cottages AS c
LEFT JOIN (SELECT CottageId, COUNT(*) AS UnitsTaken
           FROM dbo.vw_ActiveBookings
           WHERE [Date] = @Date AND SlotId = @Slot AND CottageId IS NOT NULL
           GROUP BY CottageId) AS u ON u.CottageId = c.Id
WHERE c.Status = N'available' AND c.Units - COALESCE(u.UnitsTaken, 0) > 0
ORDER BY c.Kind, c.Name;

-- 2d. Dates that are completely full for a session in the next 60 days.
SELECT o.[Date], o.SlotLabel, o.BookedGuests, o.Capacity
FROM dbo.vw_SlotOccupancy AS o
WHERE o.SlotId = @Slot AND o.SpotsLeft <= 0
  AND o.[Date] BETWEEN CONVERT(nvarchar(10), GETDATE(), 23) AND CONVERT(nvarchar(10), DATEADD(DAY, 60, GETDATE()), 23);
GO

/* ===================================================================================
   3. PREVENT CONFLICTING / DUPLICATE BOOKINGS  (what the app enforces on every booking)
   =================================================================================== */
DECLARE @Date2    nvarchar(10)  = N'2026-10-23';
DECLARE @Slot2    nvarchar(64)  = N'day-tour';
DECLARE @Cottage  nvarchar(100) = N'c4';
DECLARE @GuestId  nvarchar(100) = N'g1';

-- 3a. Cottage / room already fully taken for that date + session?  (rows returned = CONFLICT)
SELECT c.Id, c.Name, c.Units, COUNT(b.Id) AS UnitsTaken
FROM dbo.Cottages AS c
JOIN dbo.vw_ActiveBookings AS b ON b.CottageId = c.Id AND b.[Date] = @Date2 AND b.SlotId = @Slot2
WHERE c.Id = @Cottage
GROUP BY c.Id, c.Name, c.Units
HAVING COUNT(b.Id) >= c.Units;

-- 3b. Same guest already has a booking for that date + session?  (rows returned = DUPLICATE)
SELECT b.Id, b.Status, b.Guests
FROM dbo.vw_ActiveBookings AS b
WHERE b.GuestId = @GuestId AND b.[Date] = @Date2 AND b.SlotId = @Slot2;

-- 3c. Audit: any cottage that is double-booked right now (should always return zero rows).
SELECT [Date], SlotId, CottageId, COUNT(*) AS Bookings
FROM dbo.vw_ActiveBookings
WHERE CottageId IS NOT NULL
GROUP BY [Date], SlotId, CottageId
HAVING COUNT(*) > (SELECT Units FROM dbo.Cottages WHERE Id = CottageId);

-- 3d. Audit: any session over its capacity (should always return zero rows).
SELECT * FROM dbo.vw_SlotOccupancy WHERE SpotsLeft < 0;
GO

/* ===================================================================================
   4. VIEW AND MANAGE BOOKING RECORDS  (guest "My bookings", staff appointments, admin bookings)
   =================================================================================== */

-- 4a. One guest's bookings (guest page) - newest first.
DECLARE @GuestId2 nvarchar(100) = N'g1';
SELECT b.Id, b.[Date], b.SlotId, b.Type, b.Guests, b.Status, b.PaymentStatus, b.Paid, b.Total, b.Total - b.Paid AS Balance,
       b.CottageId, b.CreatedAt
FROM dbo.Bookings AS b
WHERE b.GuestId = @GuestId2
ORDER BY b.CreatedAt DESC;

-- 4b. Staff "Today" tab.
SELECT b.Id, b.GuestName, b.SlotId, b.Type, b.Guests, b.Status, b.PaymentStatus, b.Paid, b.Total, b.TimeIn, b.TimeOut
FROM dbo.Bookings AS b
WHERE b.[Date] = CONVERT(nvarchar(10), GETDATE(), 23) AND b.Status <> N'cancelled'
ORDER BY b.SlotId, b.GuestName;

-- 4c. Upcoming bookings with a balance still to collect.
SELECT b.Id, b.GuestName, b.Phone, b.[Date], b.SlotId, b.Total, b.Paid, b.Total - b.Paid AS Balance
FROM dbo.vw_ActiveBookings AS b
WHERE b.Total > b.Paid AND b.[Date] >= CONVERT(nvarchar(10), GETDATE(), 23)
ORDER BY b.[Date];

-- 4d. Search by name, e-mail, phone or booking number (admin / command search).
DECLARE @Search nvarchar(100) = N'mika';
SELECT TOP (50) b.Id, b.GuestName, b.Email, b.Phone, b.[Date], b.SlotId, b.Status
FROM dbo.Bookings AS b
WHERE b.Id LIKE N'%' + @Search + N'%' OR b.GuestName LIKE N'%' + @Search + N'%'
   OR b.Email LIKE N'%' + @Search + N'%' OR b.Phone LIKE N'%' + @Search + N'%'
ORDER BY b.CreatedAt DESC;

-- 4e. Booking add-ons and guest mix are stored as JSON text: expand them with OPENJSON.
SELECT b.Id, a.AddonId, a.Name, a.Qty, a.Price, a.Deposit
FROM dbo.Bookings AS b
CROSS APPLY OPENJSON(b.Addons) WITH (
        AddonId nvarchar(100) '$.id', Name nvarchar(200) '$.name',
        Qty int '$.qty', Price int '$.price', Deposit int '$.deposit') AS a
WHERE b.Addons IS NOT NULL AND b.Addons <> N'[]';

SELECT b.Id, m.Adult, m.Child, m.Senior, m.Pwd
FROM dbo.Bookings AS b
CROSS APPLY OPENJSON(b.Mix) WITH (Adult int '$.adult', Child int '$.child', Senior int '$.senior', Pwd int '$.pwd') AS m
WHERE b.Mix IS NOT NULL AND b.Mix <> N'';
GO

/* ===================================================================================
   5. PAYMENTS, CHECK-IN, CANCELLATION, REFUNDS
   =================================================================================== */

-- 5a. Proof-of-payment queue (waiting for the front desk / admin).
SELECT b.Id, b.GuestName, b.PaymentMethod, b.ProofName, b.DueNow, b.StaffApproval, b.PaymentStatus
FROM dbo.Bookings AS b
WHERE b.PaymentStatus = N'submitted'
ORDER BY b.CreatedAt;

-- 5b. Unpaid online holds that are about to expire.
SELECT b.Id, b.GuestName, b.[Date], b.PaymentDeadline
FROM dbo.Bookings AS b
WHERE b.Status = N'pending' AND b.PaymentStatus = N'unpaid' AND b.PaymentDeadline IS NOT NULL
ORDER BY b.PaymentDeadline;

-- 5c. Cancellation requests waiting for the front desk.
SELECT b.Id, b.GuestName, b.[Date], b.Paid, b.CancelRequestedAt, b.CancelReason
FROM dbo.Bookings AS b
WHERE b.Status = N'cancellation-requested'
ORDER BY b.CancelRequestedAt;

-- 5d. Refunds and kept deposits.
SELECT r.At, r.BookingId, r.GuestName, r.Kind, r.Amount, r.Reason, r.[By]
FROM dbo.Refunds AS r
ORDER BY r.At DESC;

-- 5e. Guests currently inside the resort (checked in, not yet out).
SELECT SUM(b.Guests) AS GuestsInside
FROM dbo.Bookings AS b
WHERE b.Status = N'checked-in';

-- 5f. Payments received per day, per method.
SELECT LEFT(b.CreatedAt, 10) AS BookedOn, b.PaymentMethod, COUNT(*) AS Bookings, SUM(b.Paid) AS Collected
FROM dbo.Bookings AS b
WHERE b.Paid > 0
GROUP BY LEFT(b.CreatedAt, 10), b.PaymentMethod
ORDER BY BookedOn DESC;
GO

/* ===================================================================================
   6. ACCOUNTS AND ADMINISTRATION
   =================================================================================== */

-- 6a. All sign-in accounts (the password is stored only as a salted hash and is never shown).
SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, u.GuestId
FROM dbo.Users AS u
ORDER BY u.Role, u.Name;

-- 6b. Guest profiles with their booking history and reliability counters.
SELECT g.Id, g.Name, g.Email, g.Phone, g.Visits, g.Cancellations, g.NoShows, g.Risk,
       (SELECT COUNT(*) FROM dbo.Bookings AS b WHERE b.GuestId = g.Id) AS TotalBookings
FROM dbo.Guests AS g
ORDER BY g.Name;

-- 6c. Staff accounts, lifeguards and this week's roster.
SELECT * FROM dbo.Staff;
SELECT * FROM dbo.Lifeguards;
SELECT r.* FROM dbo.Roster AS r WHERE r.[Date] >= CONVERT(nvarchar(10), GETDATE(), 23) ORDER BY r.[Date];

-- 6d. Configuration the admin screens edit.
SELECT * FROM dbo.Slots;      -- session capacity and open/closed
SELECT * FROM dbo.Cottages;   -- price, units, status (available / maintenance)
SELECT * FROM dbo.Blackouts ORDER BY [Date];
SELECT * FROM dbo.Policies;
SELECT * FROM dbo.Settings;   -- downpayment %, hold times, cancellation hours (JSON columns)
SELECT * FROM dbo.Tariff;     -- rates per guest type (JSON)
SELECT * FROM dbo.Addons;

-- 6e. Operations logs.
SELECT TOP (100) * FROM dbo.AuditLog ORDER BY Seq DESC;                -- who changed what
SELECT * FROM dbo.Incidents ORDER BY CreatedAt DESC;
SELECT * FROM dbo.Maintenance ORDER BY Id DESC;
SELECT TOP (50) * FROM dbo.PoolLogs ORDER BY Seq DESC;
SELECT * FROM dbo.Waitlist WHERE Status = N'waiting' ORDER BY CreatedAt;
GO

/* ===================================================================================
   7. REPORTS (admin dashboard / reports)
   =================================================================================== */

-- 7a. Bookings and revenue per month.
SELECT LEFT(b.[Date], 7) AS [Month], COUNT(*) AS Bookings, SUM(b.Guests) AS Guests, SUM(b.Paid) AS Revenue
FROM dbo.Bookings AS b
WHERE b.Status NOT IN (N'cancelled', N'expired')
GROUP BY LEFT(b.[Date], 7)
ORDER BY [Month] DESC;

-- 7b. No-show and cancellation rate per session.
SELECT b.SlotId,
       COUNT(*)                                                         AS Total,
       SUM(CASE WHEN b.Status = N'no-show'   THEN 1 ELSE 0 END)         AS NoShows,
       SUM(CASE WHEN b.Status = N'cancelled' THEN 1 ELSE 0 END)         AS Cancelled,
       CAST(100.0 * SUM(CASE WHEN b.Status = N'no-show' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS decimal(5,1)) AS NoShowPct
FROM dbo.Bookings AS b
GROUP BY b.SlotId;

-- 7c. Busiest dates (next 30 days).
SELECT TOP (10) o.[Date], SUM(o.BookedGuests) AS Guests
FROM dbo.vw_SlotOccupancy AS o
WHERE o.[Date] >= CONVERT(nvarchar(10), GETDATE(), 23)
GROUP BY o.[Date]
ORDER BY Guests DESC;

-- 7d. Walk-in versus online.
SELECT b.Source, COUNT(*) AS Bookings, SUM(b.Paid) AS Revenue FROM dbo.Bookings AS b GROUP BY b.Source;
GO

/* ===================================================================================
   8. MANUAL FIX EXAMPLES  -  STOP THE APPLICATION FIRST, then restart it afterwards.
      (Normal changes should always be made through the app, which validates them.)
   =================================================================================== */
/*
-- Close a session for maintenance:
UPDATE dbo.Slots SET Active = 0 WHERE Id = N'night-swim';

-- Put a cottage under maintenance:
UPDATE dbo.Cottages SET Status = N'maintenance' WHERE Id = N'c1';

-- Cancel a booking (the app also records refunds and notices; prefer doing this in the app):
UPDATE dbo.Bookings SET Status = N'cancelled' WHERE Id = N'TMP-1100';

-- Remove old finished bookings from before a date (keep your audit requirements in mind):
-- DELETE FROM dbo.Bookings WHERE Status IN (N'completed', N'checked-out') AND [Date] < N'2026-01-01';
*/
