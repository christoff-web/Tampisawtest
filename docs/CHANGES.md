# Change summary (system improvements round)

## Added / implemented
* **Root Admin** role (`root-admin`): creates, edits, archives, restores, deletes Admin and Receptionist accounts and resets their passwords; owns the audit log. Protected from deletion, archiving, demotion and from being created through the API. Admin and Receptionist cannot manage accounts.
* **Audit log** now records the real person and role for every action (it used to write a fixed name), with date and time. Account events are visible to the Root Admin only; admins and the front desk keep the booking history their screens use.
* **Password rules** (8+ characters, uppercase, number, special character) enforced on the server for sign-up, reset, staff creation, root reset and password change; live checklist and Caps Lock warning in the browser.
* **Forgot password** for guest, receptionist, admin and root admin (e-mailed one-time code). Sessions end after a password change or when an account is archived.
* **Contact numbers**: `09XXXXXXXXX` / `+639XXXXXXXXX`, live red warning, repeated-digit numbers refused; stored as `09XXXXXXXXX`.
* **Terms and Conditions** modal; the agreement box unlocks only after scrolling to the end. Required at sign-up and in the booking waiver step.
* **Booking page**: compact month calendar; typed numeric guest counts next to the +/- buttons; the form is cleared only after the server saves the booking.
* **Payments & Refunds**: contact number, Cash / E-Wallet, Online / Walk-in columns, filters, "show more" paging. Online / Walk-in filters on the Appointments and Admin Bookings tables.

## Fixed
* **Pavilion / space availability**: a guest's own 10-minute checkout hold counted as "another guest" and blocked their booking of single-unit spaces; holds ignored the event time block; rejected-payment bookings kept blocking the date. Now the own hold is ignored, holds are per time block, and cancelled / expired / no-show / payment-rejected bookings free the space. A guest re-uploading proof after a rejection is checked against the space again.
* Booking no longer reports itself as a conflict right after it is saved; another guest's hold is no longer released when someone else books.
* Report tabs rebuilt the whole page and jumped to the top; tabs of one screen now share the page. Global smooth-scroll and button hover "lift" removed.

## Removed
* The face-verification selfie at sign-up and `Users.FaceImage`. (The QR camera scanner for check-in was removed by mistake in the first round and is restored; the camera permission is allowed for this site only.)
* Global header search and Ctrl+K palette (table filters stay).
* Demo accounts and demo login buttons, the page showing demo passwords, demo forecast history ("Fill gaps with demo history"), "Demo only" payment text, the sample guest in the booking form, the unused e-mail verification component, the unused roster "staff accounts" actions.
* SQLite and every non-SQL-Server setting; stray .NET Framework config files and an empty duplicate project file at the repository root; the duplicate `01_Tampisaw_Schema.sql`.

# Second round

## Added / implemented
* **Footer** on the landing page with the resort's Facebook (placeholder URL in `frontend/src/components/site-footer.tsx`, `FACEBOOK_URL`), clickable phone `09691219930` and e-mail `Goldenpyramidresort@gmail.com`.
* **Notifications**: bell with an unread counter in every page header, read/unread dots, "Mark all read", type labels (booking, payment, refund, cancellation, account), a pop-up toast when a new one arrives (the data refreshes by itself). "Read" is remembered per person in that browser. Password changes and resets now notify the guest.
* **Walk-in cabanas**: the two Small Cabanas are separate options (Small Cabana 1 / 2) with live Available / Booked status; both can be chosen only if both are free. Walk-ins are saved as Walk-in and share the same availability rules as online bookings.
* **Archive / soft delete**: finished bookings (cancelled, expired, no-show, completed, checked out) can be archived and restored by the front desk and admin; Archived tab on Appointments and an archived filter on the admin Bookings list. Archived bookings never block availability. Permanent delete: admin only, archived only, never if money was paid or a refund exists; every step is in the audit log. Admins can also archive/restore guest accounts. Staff accounts archive/restore stays with the Root Admin.
* **Cancellation reason**: optional box (labelled Optional, 500 characters) in the guest cancel dialog; saved with the booking and shown to staff in Payments & Refunds, the booking details and the admin booking details.
* **Partial or full payment** at checkout (cottage, room, pavilion): the amount to pay, remaining balance, option, method and status update when the guest switches. Pool entry stays full payment only (resort rule). Cash is collected at the cashier and stays unpaid until staff receive it. Staff see option, method, status and balance.
* **Root Admin** is now limited to **Staff Accounts** and **Audit Logs**: its own page with just those two tabs, no operational screens, and the server refuses every other action for that role and sends it no bookings, guests or finances. Admin and Receptionist have no staff-account or account-audit screens; they still receive booking-related history for booking timelines and shift reports.

## Fixed
* Page changes and tab clicks no longer fade the whole screen in (the "blinking"); screens are fetched in the background so there is no loading flash.

## Honest limits of this round
* The Small Cabana units are not individually tracked in the database: the system knows how many of the two are taken, not which one. The two options are shown as the first free unit(s).
* Archive covers bookings and guest/staff accounts. Other records (closures, policies, incidents, maintenance, add-ons) still use their existing delete or have no delete.
* Notification read marks are per browser, not saved in SQL Server.
* "UI alignment" was not a full audit: I could not run a browser here, so only the screens I touched were built with responsive layouts. Please review the rest on desktop, tablet and phone.
* A second hand-written migration, `20261025090000_BookingArchiveAndPaymentOption`, adds `Bookings.Archived/ArchivedAt/ArchivedBy/PaymentOption`. (The first one ran correctly on your SQL Server.)

## Verified
* 97 backend unit tests and an 80-check end-to-end API test passed against the in-memory build. The frontend type-checks and builds.

## NOT verified (needs you)
* Everything that touches SQL Server: the EF migration `20261024090000_RootAdminAndAccountSecurity`, the model snapshot edit and the SQL-Server-only code could not be compiled or run where this was prepared (NuGet was unreachable). Build the solution in Visual Studio and start it against a copy of your database first.
* The UI was type-checked and built, but not exercised in a browser; the scroll fix, calendar and modals especially need a manual look on desktop and phone.
* E-mailing reset codes needs an SMTP server in `Smtp:*`.
* New screens are English only (the Filipino translation covers the strings that were edited).
* The `StaffAccount` roster table is left in the database but no longer used by any screen.
* Not built: booking archive, database backup tooling, daily/weekly/monthly report exports beyond those that already existed.
