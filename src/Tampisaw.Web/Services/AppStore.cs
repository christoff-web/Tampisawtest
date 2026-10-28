using Tampisaw.Data;
using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 * Public API index (AppStore). Every mutation runs under one lock, then raises Changed.
 * Reads: use State (live snapshot; never mutate it directly) or the helpers below.
 *
 *  State                                         AppState           shared in-memory state (read only from UI code)
 *  event Changed                                 Action?            raised after every mutation; components re-render
 *  Read<T>(f)                                    T                  run f(State) under the lock
 *  Edit(Action<AppState>)                        void               generic locked mutation + Changed (for extra partial files)
 *  Reset()                                       void               restore the clean-slate seed state
 *  Tick()                                        void               expire holds/payments, warn, auto-remind, auto no-show
 *
 *  Lookups / derived
 *  FindBooking(id)                               Booking?
 *  FindGuest(id)                                 Guest?
 *  FindCottage(id)                               Cottage?
 *  BookingsOf(guestId)                           List<Booking>      newest first
 *  NoticesFor(audience, guestId?)                List<Notice>       newest first
 *  TodayBookings()                               List<Booking>      today's (local) bookings that are not cancelled
 *  Headcount()                                   int                guests currently checked in today
 *  NextBookingId()                               string             next unused "TMP-nnnn"
 *  NewId(prefix)                                 string             unique id such as "BLK-1234-ab"
 *  CurrentGuardsNeeded()                         int                lifeguards required for the current headcount
 *
 *  Accounts
 *  Authenticate(email, password)                 AuthResult         checks credentials (Session.Login wraps it)
 *  RegisterGuest(name,email,phone,password,birthdate?,faceImage?)  AuthResult  creates user + guest
 *  EmailTaken(email)                             bool
 *  Register(User, Guest)                         void               low level reducer action
 *
 *  Booking flow (guest)
 *  PatchDraft(Action<DraftBooking>)              void               edit the shared draft
 *  PlaceHold(id,date,slotId,guests,cottageId?)   void               10-minute slot hold
 *  ReleaseHold(id)                               void
 *  CreateBooking(Booking)                        Booking            prepends, clears holds for slot, caps cottage hours
 *  SubmitPaymentProof(id,method,name,image?)     void               paymentStatus -> submitted
 *  SubmitBalanceProof(id,name,image?)            void
 *  ConfirmAttendance(id)                         void
 *  RequestCancel(id)                             void               status -> cancellation-requested
 *  PayBalance(id, method, by)                    void               guest pays remaining balance online
 *  SetQrToken(id, token)                         void
 *
 *  Payments and cancellations (staff / admin)
 *  VerifyPayment(id,approved,by,byRole)          void               receptionist approve = staffApproval only; admin approve confirms
 *  RejectBalanceProof(id, by)                    void
 *  CollectPayment(id,amount,by,note?,method?)    void               counter payment (cash | gcash)
 *  SendReminder(id, by)                          void
 *  Cancel(id)                                    void
 *  ProcessCancel(id,by,eligible,amount,reason?)  void               cancels and logs a refund / kept deposit
 *  Reschedule(id,date,slotId,by)                 void
 *  MarkNoShow(id)                                void
 *  BillOvertime(id, OvertimeCharge)              void
 *  SendExpiryAlert(id)                           void
 *  WeatherCancel(date,slotId?,mode,newDate?,by)  int                affected bookings
 *
 *  Gate and operations
 *  AddWalkIn(Booking)                            void
 *  CheckIn(id)                                   void
 *  IssueBracelets(id, by)                        void
 *  SpotCheck(bookingId?,serial?,result,detail,by) void
 *  ReplaceBracelet(id, reason, by)               void
 *  TimeOut(id, returned, by)                     void
 *  AddIncident(Incident)                         Incident           id assigned here
 *  UpdateIncident(id, patch?, note?, by, notify?) void
 *  AddMaintenance(MaintenanceRequest)            MaintenanceRequest
 *  UpdateMaintenance(id, patch?, note?, by, notify?) void
 *  AddPoolLog(PoolLog)                           void
 *  AssignShift(date, shift, guardId, by)         void
 *  UnassignShift(id, by)                         void
 *  AddDamageFee(guestId, DamageFee)              void
 *  SettleDamageFee(guestId, feeId, by)           void
 *
 *  Admin configuration
 *  UpdateSlot(Slot) / UpdateCottage(Cottage)     void               replace by id (cottage is upserted)
 *  SavePolicy(Policy, by) / DeletePolicy(id, by) void
 *  AddBlackout(date,slotId?,reason,kind?)        void
 *  RemoveBlackout(id, by) / SetBlackoutKind(id, kind) void
 *  ToggleStaff(id) / AddStaff(name, role)        void
 *  SaveSettings(Settings, by) / SaveTariff(Tariff, by) / SaveOpsConfig(OpsConfig, by) / SaveAddon(Addon, by)  void
 *  Log(action, bookingId?, actor?)               void               append an audit event
 *  AddNotice(audience, message, guestId?, bookingId?)  void
 *
 *  Database (see Data/): AppStore() is in-memory only (tests); AppStore(IStatePersistence) loads from and writes through to the database.
 *  DatabaseInfo                                  DatabaseInfo       provider, target, Connected, LastError (Summary = footer text)
 *  WeatherCancel(date,slotId?,mode,newDate?,by,ids?)  int           overload that only touches the given booking ids
 *  More operations live in AppStore.Privacy.cs (DeleteUser, DeleteMyAccount, BulkNotify, QueueSync/MarkSynced, SaveShift)
 *  and AppStore.Waitlist.cs (JoinWaitlist, LeaveWaitlist, WaitlistOf, WaitingCount).
 */

public record AuthResult(bool Ok, User? User, string? Error)
{
    public static AuthResult Success(User user) => new(true, user, null);
    public static AuthResult Fail(string error) => new(false, null, error);
}

public sealed partial class AppStore
{
    private readonly object _gate = new();
    private readonly IStatePersistence? _persistence;
    private AppState _state;
    private long _idCounter;

    /// <summary>In-memory only (no database). Used by unit tests and quick experiments; starts from the clean seed.</summary>
    public AppStore()
    {
        _state = Seed.Create();
        EnsureRootAdmin(new RootAdminOptions(Password: "Root#Pass123"));   // test/dev only: a fixed root password for the in-memory store
    }

    /// <summary>
    /// Loads the state from the database (creating and seeding it when empty); every edit is written back.
    /// Makes sure a Root Admin account exists (see RootAdminOptions and EnsureRootAdmin).
    /// </summary>
    public AppStore(IStatePersistence persistence, RootAdminOptions? rootAdmin = null)
    {
        _persistence = persistence;
        _state = persistence.LoadOrSeed(() => Seed.Create(includeDemoAccounts: false));
        EnsureRootAdmin(rootAdmin ?? new RootAdminOptions());
    }

    public event Action? Changed;

    public AppState State => _state;

    /// <summary>Which database the store writes to, and whether the last write worked (for the admin footer).</summary>
    public DatabaseInfo DatabaseInfo => _persistence?.Info ?? DatabaseInfo.None;

    public T Read<T>(Func<AppState, T> read)
    {
        lock (_gate) return read(_state);
    }

    /// <summary>Locked mutation that raises Changed and writes the changes to the database. Lists must be replaced (not edited in place) when items are added or removed.</summary>
    public void Edit(Action<AppState> change) => EditCore<int>(s => { change(s); return 0; });

    private T Edit<T>(Func<AppState, T> change) => EditCore(change);

    /// <summary>The single mutation path: change under the lock, notify waiting guests, persist, then raise Changed.</summary>
    private T EditCore<T>(Func<AppState, T> change, bool promote = true)
    {
        T result;
        lock (_gate)
        {
            result = change(_state);
            if (promote) PromoteWaitlist(_state);
            _persistence?.Save(_state);
        }
        Changed?.Invoke();
        return result;
    }

    public void Reset()
    {
        lock (_gate)
        {
            _state = Seed.Create(includeDemoAccounts: _persistence is null);
            _persistence?.Reset(_state);
        }
        Changed?.Invoke();
    }

    // ------------------------------------------------------------ ids, logging, notices

    public string NewId(string prefix) =>
        $"{prefix}-{Ops.NowMs()}-{Interlocked.Increment(ref _idCounter) % 1000:000}";

    private static List<T> Prepend<T>(List<T> list, T item) => [item, .. list];

    private static List<T> Prepend<T>(List<T> list, IEnumerable<T> items) => [.. items, .. list];

    private AuditEvent Audit(string action, string? bookingId = null, string actor = SystemActor)
    {
        // While the dispatcher is running a request, every entry is stamped with the signed-in person's real name and role;
        // generic labels such as "Staff" or "Gate Staff" are replaced by that name. Background work is attributed to "System".
        var role = actor == SystemActor ? "system" : null;
        if (_actor is { } who && actor != SystemActor)
        {
            role = who.Role;
            if (actor is "Guest" or "Staff" or "Gate Staff" or "Admin" or "Andrea M.") actor = who.Name;
        }
        return new AuditEvent { Id = NewId("AUD"), At = Ops.NowIso(), Actor = actor, Role = role, Action = action, BookingId = bookingId };
    }

    private Notice MakeNotice(string audience, string message, string? guestId = null, string? bookingId = null) => new()
    {
        Id = NewId("N"),
        At = Ops.NowIso(),
        Audience = audience,
        GuestId = guestId,
        BookingId = bookingId,
        Message = message,
    };

    private void Push(AppState s, AuditEvent audit) => s.AuditLog = Prepend(s.AuditLog, audit);

    private void Push(AppState s, Notice notice) => s.Notices = Prepend(s.Notices, notice);

    public void Log(string action, string? bookingId = null, string actor = SystemActor) =>
        Edit(s => Push(s, Audit(action, bookingId, actor)));

    public void AddNotice(string audience, string message, string? guestId = null, string? bookingId = null) =>
        Edit(s => Push(s, MakeNotice(audience, message, guestId, bookingId)));

    private static Booking? Find(AppState s, string id) => s.Bookings.FirstOrDefault(b => b.Id == id);

    // ------------------------------------------------------------ lookups and derived values

    public Booking? FindBooking(string id) => Read(s => Find(s, id));

    public Guest? FindGuest(string id) => Read(s => s.Guests.FirstOrDefault(g => g.Id == id));

    public Cottage? FindCottage(string? id) => id is null ? null : Read(s => s.Cottages.FirstOrDefault(c => c.Id == id));

    public List<Booking> BookingsOf(string guestId) => Read(s => s.Bookings.Where(b => b.GuestId == guestId).ToList());

    public List<Notice> NoticesFor(string audience, string? guestId = null) =>
        Read(s => s.Notices.Where(n => n.Audience == audience && (guestId is null || n.GuestId is null || n.GuestId == guestId)).ToList());

    public List<Booking> TodayBookings()
    {
        var today = Ops.TodayLocal();
        return Read(s => s.Bookings.Where(b => b.Date == today && b.Status != BookingStatus.Cancelled).ToList());
    }

    public int Headcount() => TodayBookings().Where(b => b.Status == BookingStatus.CheckedIn).Sum(b => b.Guests);

    public int CurrentGuardsNeeded() =>
        Read(s => Ops.GuardsNeeded(Headcount(), s.OpsConfig.GuestsPerLifeguard, s.OpsConfig.MinLifeguardsPerShift));

    public string NextBookingId() => Read(s =>
    {
        var max = s.Bookings
            .Select(b => b.Id.StartsWith("TMP-", StringComparison.Ordinal) && int.TryParse(b.Id.AsSpan(4), out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();
        return $"TMP-{Math.Max(1100, max) + 1}";
    });

    // ------------------------------------------------------------ accounts

    public bool EmailTaken(string email) =>
        Read(s => s.Users.Any(u => u.Email.Equals(email.Trim(), StringComparison.OrdinalIgnoreCase)));

    public AuthResult Authenticate(string email, string password)
    {
        var user = Read(s => s.Users.FirstOrDefault(u => u.Email.Equals(email.Trim(), StringComparison.OrdinalIgnoreCase)));
        if (user is not null && !PasswordHasher.Verify(password, user.PasswordHash)) user = null;
        if (user is null) return AuthResult.Fail("Access denied: wrong email or password.");
        // Checked only after the password, so the message does not reveal which e-mails exist.
        if (user.Archived) return AuthResult.Fail("This account has been deactivated. Please contact the system administrator.");
        return AuthResult.Success(user);
    }

    public User? FindUser(string id) => Read(s => s.Users.FirstOrDefault(u => u.Id == id));

    public void Register(User user, Guest guest) => Edit(s =>
    {
        s.Users = [.. s.Users, user];
        s.Guests = [.. s.Guests, guest];
        Push(s, Audit($"Guest account registered: {user.Email}", null, user.Name));
    });

    public AuthResult RegisterGuest(string name, string email, string phone, string password, string? birthdate = null)
    {
        var clean = email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(name) || !Ops.IsValidEmail(clean))
            return AuthResult.Fail("Enter your name and a valid email address.");
        // Phone is required; accounts are active immediately after signup.
        var canonicalPhone = Ops.CanonicalPhone(phone);
        if (canonicalPhone is null)
            return AuthResult.Fail("Enter a valid mobile number: 09XXXXXXXXX or +639XXXXXXXXX.");
        if (PasswordPolicy.Error(password) is { } weak) return AuthResult.Fail(weak);
        if (EmailTaken(clean))
            return AuthResult.Fail("That email is already registered. Log in instead.");
        var guestId = $"g-{Ops.NowMs()}";
        var user = new User
        {
            Id = $"u-{guestId}",
            Name = name.Trim(),
            Email = clean,
            Phone = canonicalPhone,
            PasswordHash = PasswordHasher.Hash(password),
            Role = Roles.Guest,
            GuestId = guestId,
            Birthdate = birthdate,
            CreatedAt = Ops.NowIso(),
            CreatedBy = "Self sign-up",
        };
        Register(user, new Guest { Id = guestId, Name = user.Name, Email = clean, Phone = user.Phone });
        return AuthResult.Success(user);
    }

    // ------------------------------------------------------------ booking flow

    public void PatchDraft(Action<DraftBooking> patch) => Edit(s => patch(s.Draft));

    public void PlaceHold(string id, string date, string slotId, int guests, string? cottageId = null, string? eventStart = null, string? guestId = null) => Edit(s =>
    {
        s.Holds =
        [
            .. s.Holds.Where(h => h.Id != id),
            new Hold { Id = id, Date = date, SlotId = slotId, Guests = guests, CottageId = cottageId, EventStart = eventStart, GuestId = guestId, ExpiresAt = Ops.IsoOffset(10.0 / 60) },
        ];
    });

    public void ReleaseHold(string id) => Edit(s => s.Holds = s.Holds.Where(h => h.Id != id).ToList());

    public Booking CreateBooking(Booking booking) => Edit(s =>
    {
        var cap = Ops.DurationCapFor(s.Tariff, booking.SlotId);
        booking.CottageHours = booking.Type == BookingType.Cottage ? Math.Max(1, Math.Min(booking.CottageHours ?? cap, cap)) : null;
        booking.CreatedAt ??= Ops.NowIso();
        booking.Receipt ??= Receipt.None;
        if (booking.PaymentMethod == PayMethod.Cash)
        {
            // Cash is paid at the cashier on arrival: nothing is due online and no receipt is issued yet.
            booking.DueNow = null;
            booking.Receipt = Receipt.None;
        }
        s.Bookings = Prepend(s.Bookings, booking);
        // Only this guest's own holds end with the booking; other guests who are still checking out keep theirs.
        s.Holds = s.Holds.Where(h => h.GuestId != booking.GuestId && h.Id != booking.Id).ToList();
        Push(s, Audit("Created pending reservation", booking.Id, booking.GuestName));
        return booking;
    });

    public void SubmitPaymentProof(string id, string method, string proofName, string? proofImage = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        if (b.Status is BookingStatus.Cancelled or BookingStatus.Expired or BookingStatus.NoShow or BookingStatus.Completed or BookingStatus.CheckedOut) return;
        if (b.PaymentStatus is PaymentStatus.Submitted or PaymentStatus.Verified) return;
        if (b.Source == BookingSource.Online && !string.Equals(method, PayMethod.Qr, StringComparison.OrdinalIgnoreCase)) return;
        if (string.IsNullOrWhiteSpace(proofName) || (b.Source == BookingSource.Online && string.IsNullOrWhiteSpace(proofImage))) return;
        b.PaymentStatus = PaymentStatus.Submitted;
        b.PaymentMethod = b.Source == BookingSource.Online ? PayMethod.Qr : method;
        b.ProofName = proofName;
        b.ProofImage = proofImage;
        Push(s, Audit("Submitted proof of payment", id, "Guest"));
    });

    public void SubmitBalanceProof(string id, string name, string? image = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.BalanceProof = new BalanceProof { Name = name, Image = image, SubmittedAt = Ops.NowIso(), Status = BalanceProofStatus.Submitted };
        Push(s, MakeNotice(NoticeAudience.Staff, $"{id}: guest uploaded proof of balance payment for verification.", null, id));
        Push(s, Audit("Submitted proof of balance payment", id, "Guest"));
    });

    public void RejectBalanceProof(string id, string by = "Staff") => Edit(s =>
    {
        var b = Find(s, id);
        if (b?.BalanceProof is null) return;
        b.BalanceProof.Status = BalanceProofStatus.Rejected;
        Push(s, MakeNotice(NoticeAudience.Guest, $"Your balance payment proof for {b.Id} was rejected. Please upload a clear proof again.", b.GuestId, b.Id));
        Push(s, Audit("Rejected balance payment proof", id, by));
    });

    public void ConfirmAttendance(string id) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.AttendanceConfirmed = true;
        Push(s, MakeNotice(NoticeAudience.Staff, $"{id}: guest confirmed attendance (risk score recalculated).", null, id));
        Push(s, Audit("Guest confirmed attendance", id, "Guest"));
    });

    public void RequestCancel(string id, string? reason = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Status = BookingStatus.CancellationRequested;
        b.CancelRequestedAt = Ops.NowIso();
        b.CancelReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        Push(s, MakeNotice(NoticeAudience.Staff, $"Cancellation requested for {id}. Review in Payments & Refunds.", null, id));
        Push(s, Audit("Guest requested cancellation", id, "Guest"));
    });

    public void SetQrToken(string id, string token) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is not null) b.QrToken = token;
    });

    // ------------------------------------------------------------ payments and cancellations

    /// <summary>Two-step approval: a receptionist approving only records staffApproval; an admin approving confirms the money was received.</summary>
    public void VerifyPayment(string id, bool approved, string by = "Staff", string? byRole = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        if (b.PaymentStatus == PaymentStatus.Verified && approved) return;
        if (approved && b.Source == BookingSource.Online && b.PaymentMethod != PayMethod.Qr) return;
        if (approved && string.IsNullOrWhiteSpace(b.ProofImage)) return;
        if (approved && byRole != Roles.Admin)
        {
            if (b.StaffApproval is not null) return;
            b.StaffApproval = new StaffApproval { By = by, At = Ops.NowIso() };
            Push(s, MakeNotice(NoticeAudience.Staff, $"{b.Id}: {by} checked the payment proof. Waiting for admin to confirm the money was received.", null, b.Id));
            Push(s, Audit("Checked payment proof, awaiting admin confirmation", id, by));
            return;
        }
        string message;
        if (!approved)
        {
            b.PaymentStatus = PaymentStatus.Rejected;
            b.Status = BookingStatus.Pending;
            b.Risk = Risk.High;
            b.StaffApproval = null;
            message = $"Your proof of payment for {b.Id} was rejected. Please upload a clear proof again.";
        }
        else
        {
            var partial = b.DueNow is not null && b.DueNow < b.Total;
            b.Paid = Math.Max(b.Paid, b.DueNow ?? b.Paid);
            var full = b.Paid >= b.Total;
            b.PaymentStatus = PaymentStatus.Verified;
            b.StaffApproval = null;
            b.Status = b.DueNow is not null && !full ? BookingStatus.Reserved : BookingStatus.Confirmed;
            if (full) b.Receipt = Receipt.Official;
            else if (b.PaymentMethod != PayMethod.Cash) b.Receipt = Receipt.Reserved;
            b.Risk = b.Risk == Risk.High ? Risk.High : Risk.Low;
            message = $"Payment verified for {b.Id}. Your reservation is now {(partial ? $"RESERVED ({s.Settings.DownpaymentPct}% downpayment received)" : "CONFIRMED")}.";
        }
        Push(s, MakeNotice(NoticeAudience.Guest, message, b.GuestId, b.Id));
        Push(s, Audit(approved ? "Admin confirmed payment received" : "Rejected payment", id, by));
    });

    public void PayBalance(string id, string method, string by) =>
        Settle(id, null, method, by, BalanceMethod.Online);

    public void CollectPayment(string id, int amount, string by, string? note = null, string? method = null) =>
        Settle(id, amount, method ?? "counter", by, method ?? BalanceMethod.Cash);

    private void Settle(string id, int? amountOrBalance, string methodLabel, string by, string balanceMethod) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        var amount = amountOrBalance ?? Ops.BalanceOf(b);
        var paid = Math.Min(b.Total, b.Paid + amount);
        var full = paid >= b.Total;
        var live = b.Status is BookingStatus.CheckedIn or BookingStatus.CheckedOut or BookingStatus.Completed;
        b.Paid = paid;
        b.PaymentStatus = PaymentStatus.Verified;
        b.BalanceMethod = balanceMethod;
        if (b.BalanceProof is not null) b.BalanceProof.Status = BalanceProofStatus.Approved;
        b.Receipt = full ? Receipt.Official : Receipt.Reserved;
        if (!live) b.Status = full ? BookingStatus.Confirmed : paid >= (b.DueNow ?? 0) ? BookingStatus.Reserved : b.Status;
        Push(s, MakeNotice(NoticeAudience.Guest, full
            ? $"Balance settled for {b.Id} ({methodLabel}). Official receipt issued - paid in full."
            : $"Payment of {Ops.Peso(amount)} recorded for {b.Id}. Balance: {Ops.Peso(b.Total - paid)}.", b.GuestId, b.Id));
        Push(s, Audit($"Recorded {Ops.Peso(amount)} {methodLabel} payment{(full ? " (paid in full, official receipt)" : "")}", b.Id, by));
    });

    public void SendReminder(string id, string by) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.ReminderSentAt = Ops.NowIso();
        Push(s, MakeNotice(NoticeAudience.Guest,
            $"Reminder: please confirm your attendance for {b.Id} on {b.Date}. Unconfirmed bookings may be cancelled and the payment kept as a deposit.", b.GuestId, b.Id));
        Push(s, Audit("Sent attendance reminder", id, by));
    });

    public void Cancel(string id, string by = "Staff", string? reason = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Status = BookingStatus.Cancelled;
        if (!string.IsNullOrWhiteSpace(reason)) b.CancelReason = reason.Trim();
        Push(s, Audit("Cancelled reservation", id, by));
    });

    // ---- archive (soft delete) -------------------------------------------------------------------------

    /// <summary>Only bookings that are over (cancelled, expired, no-show, completed, checked out) can be archived, so a live booking can never disappear.</summary>
    public OpResult ArchiveBooking(string id, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var b = Find(s, id);
            if (b is null) { result = OpResult.Fail("That booking could not be found."); return 0; }
            if (b.Archived) return 0;
            var over = b.Status is BookingStatus.Cancelled or BookingStatus.Expired or BookingStatus.NoShow or BookingStatus.Completed or BookingStatus.CheckedOut;
            if (!over) { result = OpResult.Fail("Only finished bookings (cancelled, expired, no-show, completed or checked out) can be archived."); return 0; }
            b.Archived = true; b.ArchivedAt = Ops.NowIso(); b.ArchivedBy = by;
            Push(s, Audit($"Archived booking {id}", id, by));
            return 0;
        });
        return result;
    }

    public OpResult RestoreBooking(string id, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var b = Find(s, id);
            if (b is null) { result = OpResult.Fail("That booking could not be found."); return 0; }
            if (!b.Archived) return 0;
            b.Archived = false; b.ArchivedAt = null; b.ArchivedBy = null;
            Push(s, Audit($"Restored booking {id} from the archive", id, by));
            return 0;
        });
        return result;
    }

    /// <summary>
    /// Permanent delete: only archived bookings that never handled any money (nothing paid, no refund record). Anything with a
    /// financial trail stays for the reports and the audit log; the audit entry for the deletion itself is always kept.
    /// </summary>
    public OpResult DeleteBookingPermanently(string id, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var b = Find(s, id);
            if (b is null) { result = OpResult.Fail("That booking could not be found."); return 0; }
            if (!b.Archived) { result = OpResult.Fail("Archive the booking first. Only archived bookings can be deleted permanently."); return 0; }
            if (b.Paid > 0 || s.Refunds.Any(r => r.BookingId == id))
            { result = OpResult.Fail("This booking has payments or refunds on record, so it must be kept for the financial reports. It stays in the archive."); return 0; }
            s.Bookings = s.Bookings.Where(x => x.Id != id).ToList();
            Push(s, Audit($"Permanently deleted archived booking {id} ({b.GuestName}, {b.Date})", null, by));
            return 0;
        });
        return result;
    }

    /// <summary>Admin archives or restores a guest account (it can no longer sign in; bookings and history are untouched).</summary>
    public OpResult SetGuestArchived(string userId, bool archived, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == userId);
            if (u is null || u.Role != Roles.Guest) { result = OpResult.Fail("Guest account not found."); return 0; }
            u.Archived = archived;
            Push(s, Audit($"{(archived ? "Archived" : "Restored")} guest account: {u.Name}", null, by));
            return 0;
        });
        return result;
    }

    public void ProcessCancel(string id, string by, bool eligible, int amount, string? reason = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        if (s.Refunds.Any(r => r.BookingId == id)) return;
        b.Status = BookingStatus.Cancelled;
        s.Refunds = Prepend(s.Refunds, new Refund
        {
            Id = NewId("RF"),
            At = Ops.NowIso(),
            BookingId = b.Id,
            GuestName = b.GuestName,
            Kind = eligible ? RefundKind.Refund : RefundKind.DepositKept,
            Amount = amount,
            Reason = reason ?? (eligible ? "Cancelled 48h+ before slot" : "Late cancellation / same-day"),
            By = by,
        });
        Push(s, MakeNotice(NoticeAudience.Guest, eligible
            ? $"{b.Id} cancelled. {Ops.Peso(amount)} will be refunded within 3-5 business days."
            : $"{b.Id} cancelled. Because this was a late request, your {Ops.Peso(amount)} payment is kept as a deposit (available within 3-5 business days).", b.GuestId, b.Id));
        Push(s, Audit(eligible ? $"Cancelled; refund {Ops.Peso(amount)} entered" : $"Cancelled; {Ops.Peso(amount)} kept as deposit", b.Id, by));
    });

    public void Reschedule(string id, string date, string slotId, string? by = null) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Date = date;
        b.SlotId = slotId;
        Push(s, MakeNotice(NoticeAudience.Guest, $"{b.Id} was rescheduled by the resort to {date}.", b.GuestId, b.Id));
        Push(s, Audit("Rescheduled reservation", id, by ?? "Staff"));
    });

    public void MarkNoShow(string id, string by = "Gate Staff") => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Status = BookingStatus.NoShow;
        Push(s, Audit("Marked reservation as no-show", id, by));
    });

    public void BillOvertime(string id, OvertimeCharge overtime) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Total = b.Total - (b.Overtime?.Fee ?? 0) + overtime.Fee;
        b.Overtime = overtime;
        Push(s, Audit($"Overtime billed: {overtime.BilledHours}h = {overtime.Fee}", id, overtime.By));
    });

    public void SendExpiryAlert(string id) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null || b.ExpiryAlertSentAt is not null) return;
        b.ExpiryAlertSentAt = Ops.NowIso();
        Push(s, MakeNotice(NoticeAudience.Guest, $"Your session ({b.Id}) ends soon. Please wrap up and check out to avoid overtime charges.", b.GuestId, b.Id));
        Push(s, MakeNotice(NoticeAudience.Staff, $"{b.GuestName}'s session ({b.Id}) is about to expire.", null, b.Id));
    });

    /// <summary>Weather protocol: refund (cancel + refund paid) or reschedule all active bookings of a date/slot. Returns how many were affected.</summary>
    public int WeatherCancel(string date, string? slotId, string mode, string? newDate, string by) =>
        WeatherCancel(date, slotId, mode, newDate, by, null);

    /// <summary>Same as above but only for the given booking ids (null = every active booking of the date/slot).</summary>
    public int WeatherCancel(string date, string? slotId, string mode, string? newDate, string by, IEnumerable<string>? ids) => Edit(s =>
    {
        string[] hitStatuses = [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed];
        var only = ids?.ToHashSet();
        var hit = s.Bookings.Where(b => b.Date == date && (slotId is null || b.SlotId == slotId) && hitStatuses.Contains(b.Status)
            && (only is null || only.Contains(b.Id))).ToList();
        var refundMode = mode == WeatherMode.Refund;
        var refunds = new List<Refund>();
        foreach (var b in hit)
        {
            if (refundMode)
            {
                if (b.Paid > 0)
                    refunds.Add(new Refund { Id = NewId("RF"), At = Ops.NowIso(), BookingId = b.Id, GuestName = b.GuestName, Kind = RefundKind.Refund, Amount = b.Paid, Reason = "Inclement weather cancellation", By = by });
                Push(s, MakeNotice(NoticeAudience.Guest,
                    $"Weather advisory: your {b.Date} booking {b.Id} was cancelled and {(b.Paid > 0 ? "fully refunded" : "no payment was due")}.", b.GuestId, b.Id));
                b.Status = BookingStatus.Cancelled;
                b.CancelReason = "Inclement weather";
                b.Paid = 0;
            }
            else
            {
                Push(s, MakeNotice(NoticeAudience.Guest,
                    $"Weather advisory: your booking {b.Id} was moved to {newDate}. Reply to staff if that date doesn't work.", b.GuestId, b.Id));
                b.Date = newDate ?? b.Date;
            }
        }
        s.Refunds = Prepend(s.Refunds, refunds);
        s.Blackouts = Prepend(s.Blackouts, new Blackout { Id = NewId("BLK"), Date = date, SlotId = slotId, Reason = "Inclement weather", Kind = BlackoutKind.Weather });
        Push(s, Audit($"Weather protocol ({mode}) applied to {hit.Count} booking(s) on {date}", null, by));
        return hit.Count;
    });

    // ------------------------------------------------------------ gate and operations

    private static string ScanLine(Booking b) => $"{Ops.TimeOfDayLocal()} · {b.Id} · {b.GuestName} · {b.Guests} guests";

    public void AddWalkIn(Booking booking, string by = "Gate Staff") => Edit(s =>
    {
        s.Bookings = Prepend(s.Bookings, booking);
        Push(s, Audit("Added walk-in booking", booking.Id, by));
        s.ScanHistory = Prepend(s.ScanHistory, ScanLine(booking));
    });

    public void CheckIn(string id, string by = "Gate Staff") => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        b.Status = BookingStatus.CheckedIn;
        b.CheckedInAtISO = Ops.NowIso();
        b.CheckedInAt = Ops.TimeOfDayLocal();
        Push(s, Audit("Checked in reservation", id, by));
        s.ScanHistory = Prepend(s.ScanHistory, ScanLine(b));
    });

    public void IssueBracelets(string id, string by) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        var missing = Math.Max(0, b.Guests - b.Bracelets.Count(x => !x.Voided));
        var now = Ops.NowIso();
        var stamp = now[2..10].Replace("-", "");
        var fresh = Enumerable.Range(0, missing).Select(i => new Bracelet
        {
            Serial = $"GP{stamp}-{Random.Shared.Next(1000, 10000)}{i}",
            Color = Ops.BraceletColor(b.Type, b.SlotId),
            IssuedAt = now,
        }).ToList();
        b.Bracelets = [.. b.Bracelets, .. fresh];
        b.TimeIn ??= now;
        s.BraceletLog = Prepend(s.BraceletLog, fresh.Select(f => new BraceletEvent
        {
            Id = $"BL-{f.Serial}",
            At = now,
            BookingId = b.Id,
            Kind = BraceletKind.Issued,
            Detail = $"{f.Serial} - {f.Color}",
            By = by,
        }));
        Push(s, Audit($"Issued {missing} bracelet(s); time in recorded", b.Id, by));
    });

    public void SpotCheck(string? bookingId, string? serial, string result, string detail, string by) => Edit(s =>
    {
        var now = Ops.NowIso();
        var log = new BraceletEvent
        {
            Id = NewId("BL"),
            At = now,
            BookingId = bookingId,
            Kind = BraceletKind.SpotCheck,
            Detail = $"{result.ToUpperInvariant()}: {detail}",
            By = by,
        };
        s.BraceletLog = Prepend(s.BraceletLog, log);
        if (result != SpotCheckResult.Transfer) return;
        var b = bookingId is null ? null : Find(s, bookingId);
        foreach (var x in b?.Bracelets.Where(x => x.Serial == serial) ?? [])
        {
            x.Voided = true;
            x.VoidReason = "Suspected transfer";
        }
        s.Incidents = Prepend(s.Incidents, MakeIncident(s, new Incident
        {
            GuestName = b?.GuestName ?? "Unknown guest",
            GuestId = b?.GuestId,
            BookingId = b?.Id,
            Type = "Suspected bracelet transfer",
            Location = "Pool / cottage entrance",
            Description = $"Spot check flagged serial {serial ?? "unknown"}. {detail}",
            Source = IncidentSource.Staff,
            Serious = true,
            Escalated = true,
        }));
        Push(s, MakeNotice(NoticeAudience.Admin, $"Suspected bracelet transfer logged for {bookingId ?? "unknown booking"}.", null, bookingId));
        Push(s, Audit("Spot check: suspected transfer, serial voided", bookingId, by));
    });

    public void ReplaceBracelet(string id, string reason, string by) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        var now = Ops.NowIso();
        var old = b.Bracelets.LastOrDefault(x => !x.Voided);
        var serial = $"GP{now[2..10].Replace("-", "")}-R{Random.Shared.Next(100, 1000)}";
        var replacements = s.BraceletLog.Count(e => e.BookingId == b.Id && e.Kind == BraceletKind.Replaced) + 1;
        if (old is not null)
        {
            old.Voided = true;
            old.VoidReason = reason;
        }
        b.Bracelets = [.. b.Bracelets, new Bracelet { Serial = serial, Color = old?.Color ?? Ops.BraceletColor(b.Type, b.SlotId), IssuedAt = now }];
        s.BraceletLog = Prepend(s.BraceletLog, new BraceletEvent
        {
            Id = $"BL-{serial}",
            At = now,
            BookingId = b.Id,
            Kind = BraceletKind.Replaced,
            Detail = $"{old?.Serial ?? "-"} -> {serial} ({reason})",
            By = by,
        });
        if (replacements > 2)
        {
            s.Incidents = Prepend(s.Incidents, MakeIncident(s, new Incident
            {
                GuestName = b.GuestName,
                GuestId = b.GuestId,
                BookingId = b.Id,
                Type = "Repeated bracelet replacement",
                Location = "Front desk",
                Description = $"Replacement #{replacements} for this booking ({reason}).",
                Source = IncidentSource.Staff,
                Escalated = true,
            }));
            Push(s, MakeNotice(NoticeAudience.Admin, $"{b.Id} has needed {replacements} bracelet replacements.", null, b.Id));
        }
        Push(s, Audit($"Replaced bracelet ({reason})", b.Id, by));
    });

    public void TimeOut(string id, bool returned, string by) => Edit(s =>
    {
        var b = Find(s, id);
        if (b is null) return;
        var now = Ops.NowIso();
        b.Status = BookingStatus.CheckedOut;
        b.TimeOut = now;
        b.BraceletReturned = returned;
        foreach (var x in b.Bracelets.Where(x => !x.Voided))
        {
            x.Voided = true;
            x.VoidReason = returned ? "Returned at time out" : "Not returned (lost)";
        }
        s.BraceletLog = Prepend(s.BraceletLog, new BraceletEvent
        {
            Id = NewId("BL-OUT"),
            At = now,
            BookingId = b.Id,
            Kind = returned ? BraceletKind.TimeOut : BraceletKind.NotReturned,
            Detail = returned ? "Bracelets returned; time out recorded" : "Bracelet not returned (recorded as lost)",
            By = by,
        });
        Push(s, Audit($"Time out recorded{(returned ? "" : " (bracelet not returned)")}", b.Id, by));
    });

    private static Incident MakeIncident(AppState s, Incident i)
    {
        i.Id = $"INC-{1001 + s.Incidents.Count}";
        if (string.IsNullOrEmpty(i.CreatedAt)) i.CreatedAt = Ops.NowIso();
        return i;
    }

    public Incident AddIncident(Incident incident) => Edit(s =>
    {
        var i = MakeIncident(s, incident);
        s.Incidents = Prepend(s.Incidents, i);
        Push(s, MakeNotice(NoticeAudience.Staff, $"New incident {i.Id}: {i.Type}"));
        Push(s, Audit($"Incident {i.Id} reported: {i.Type}", i.BookingId, i.Source == IncidentSource.Guest ? i.GuestName : "Staff"));
        return i;
    });

    /// <summary>Applies patch to the incident (edit its fields freely). Resolving stamps ResolvedAt, re-opening clears it, escalating notifies admin.</summary>
    public void UpdateIncident(string id, Action<Incident>? patch, string? note, string by, string? notify = null) => Edit(s =>
    {
        var i = s.Incidents.FirstOrDefault(x => x.Id == id);
        if (i is null) return;
        var now = Ops.NowIso();
        var oldStatus = i.Status;
        var wasEscalated = i.Escalated;
        patch?.Invoke(i);
        var statusChanged = i.Status != oldStatus;
        if (statusChanged && i.Status == IncidentStatus.Resolved && oldStatus != IncidentStatus.Resolved) i.ResolvedAt ??= now;
        else if (statusChanged && i.Status is not (IncidentStatus.Resolved or IncidentStatus.Cancelled)) i.ResolvedAt = null;
        if (!string.IsNullOrEmpty(note)) i.Notes = [.. i.Notes, new Note { At = now, By = by, Text = note }];
        if (!string.IsNullOrEmpty(notify) && i.GuestId is not null) Push(s, MakeNotice(NoticeAudience.Guest, $"{i.Id}: {notify}", i.GuestId));
        if (i.Escalated && !wasEscalated) Push(s, MakeNotice(NoticeAudience.Admin, $"{i.Id} escalated to Admin."));
        Push(s, Audit($"Incident {i.Id}: {(string.IsNullOrEmpty(note) ? (statusChanged ? i.Status : "updated") : note)}", i.BookingId, by));
    });

    private static MaintenanceRequest MakeMaint(AppState s, MaintenanceRequest m)
    {
        m.Id = $"MNT-{2001 + s.Maintenance.Count}";
        if (string.IsNullOrEmpty(m.CreatedAt)) m.CreatedAt = Ops.NowIso();
        return m;
    }

    public MaintenanceRequest AddMaintenance(MaintenanceRequest request) => Edit(s =>
    {
        var m = MakeMaint(s, request);
        s.Maintenance = Prepend(s.Maintenance, m);
        Push(s, MakeNotice(NoticeAudience.Staff, $"New maintenance request {m.Id}{(m.Urgent ? " (URGENT)" : "")}: {m.Concern}"));
        Push(s, Audit($"Maintenance {m.Id} requested: {m.Concern}", m.BookingId, m.GuestName));
        return m;
    });

    public void UpdateMaintenance(string id, Action<MaintenanceRequest>? patch, string? note, string by, string? notify = null) => Edit(s =>
    {
        var m = s.Maintenance.FirstOrDefault(x => x.Id == id);
        if (m is null) return;
        var now = Ops.NowIso();
        var oldStatus = m.Status;
        var wasEscalated = m.Escalated;
        patch?.Invoke(m);
        var statusChanged = m.Status != oldStatus;
        if (statusChanged && m.Status == MaintenanceStatus.Done) m.ResolvedAt ??= now;
        else if (statusChanged && m.Status is not (MaintenanceStatus.Done or MaintenanceStatus.Cancelled)) m.ResolvedAt = null;
        if (!string.IsNullOrEmpty(note)) m.Notes = [.. m.Notes, new Note { At = now, By = by, Text = note }];
        if (!string.IsNullOrEmpty(notify) && m.GuestId is not null) Push(s, MakeNotice(NoticeAudience.Guest, $"{m.Id}: {notify}", m.GuestId));
        if (m.Escalated && !wasEscalated) Push(s, MakeNotice(NoticeAudience.Admin, $"{m.Id} escalated to Admin."));
        Push(s, Audit($"Maintenance {m.Id}: {(string.IsNullOrEmpty(note) ? (statusChanged ? m.Status : "updated") : note)}", m.BookingId, by));
    });

    public void AddPoolLog(PoolLog log) => Edit(s =>
    {
        log.Id = NewId("PL");
        log.At = Ops.NowIso();
        s.PoolLogs = Prepend(s.PoolLogs, log);
        Push(s, Audit($"Pool water log: pH {log.Ph}, chlorine {log.Chlorine} ppm", null, log.By));
    });

    public void AssignShift(string date, string shift, string guardId, string by) => Edit(s =>
    {
        if (s.Roster.Any(r => r.Date == date && r.Shift == shift && r.GuardId == guardId)) return;
        s.Roster = [.. s.Roster, new RosterEntry { Id = NewId("R"), Date = date, Shift = shift, GuardId = guardId }];
        Push(s, Audit($"Assigned lifeguard to {shift} shift on {date}", null, by));
    });

    public void UnassignShift(string id, string by) => Edit(s =>
    {
        s.Roster = s.Roster.Where(r => r.Id != id).ToList();
        Push(s, Audit("Removed lifeguard from shift", null, by));
    });

    public void AddDamageFee(string guestId, DamageFee fee) => Edit(s =>
    {
        var g = s.Guests.FirstOrDefault(x => x.Id == guestId);
        if (g is null) return;
        fee.Id = NewId("DF");
        fee.At = Ops.NowIso();
        fee.Settled = false;
        g.DamageFees = Prepend(g.DamageFees, fee);
        Push(s, Audit($"Logged damage/loss fee: {fee.Item} ({fee.Amount})", fee.BookingId, fee.By));
    });

    public void SettleDamageFee(string guestId, string feeId, string by) => Edit(s =>
    {
        var fee = s.Guests.FirstOrDefault(x => x.Id == guestId)?.DamageFees.FirstOrDefault(f => f.Id == feeId);
        if (fee is null) return;
        fee.Settled = true;
        Push(s, Audit("Settled damage/loss fee", null, by));
    });

    // ------------------------------------------------------------ admin configuration

    public void UpdateSlot(Slot slot) => Edit(s =>
    {
        var i = s.Slots.FindIndex(x => x.Id == slot.Id);
        if (i >= 0) s.Slots = [.. s.Slots[..i], slot, .. s.Slots[(i + 1)..]];
    });

    public void UpdateCottage(Cottage cottage) => Edit(s =>
    {
        var i = s.Cottages.FindIndex(x => x.Id == cottage.Id);
        s.Cottages = i >= 0 ? [.. s.Cottages[..i], cottage, .. s.Cottages[(i + 1)..]] : [.. s.Cottages, cottage];
    });

    public void SavePolicy(Policy policy, string by) => Edit(s =>
    {
        var i = s.Policies.FindIndex(x => x.Id == policy.Id);
        s.Policies = i >= 0 ? [.. s.Policies[..i], policy, .. s.Policies[(i + 1)..]] : [.. s.Policies, policy];
        Push(s, Audit($"{(i >= 0 ? "Updated" : "Added")} policy: {policy.Title}", null, by));
    });

    public void DeletePolicy(string id, string by) => Edit(s =>
    {
        s.Policies = s.Policies.Where(p => p.Id != id).ToList();
        Push(s, Audit("Removed a resort policy", null, by));
    });

    public void AddBlackout(string date, string? slotId, string reason, string? kind = null, string by = "Admin") => Edit(s =>
    {
        s.Blackouts = Prepend(s.Blackouts, new Blackout { Id = NewId("BLK"), Date = date, SlotId = slotId, Reason = reason, Kind = kind ?? BlackoutKind.Closure });
        Push(s, Audit($"Added closure on {date}: {reason}", null, by));
    });

    public void RemoveBlackout(string id, string by) => Edit(s =>
    {
        s.Blackouts = s.Blackouts.Where(b => b.Id != id).ToList();
        Push(s, Audit("Removed closure / maintenance lockout", null, by));
    });

    public void SetBlackoutKind(string id, string kind, string by = "Admin") => Edit(s =>
    {
        var b = s.Blackouts.FirstOrDefault(x => x.Id == id);
        if (b is null) return;
        b.Kind = kind;
        Push(s, Audit($"Changed closure on {b.Date} to {kind}", null, by));
    });

    public void SaveSettings(Settings settings, string by, string? detail = null) => Edit(s =>
    {
        s.Settings = settings;
        var changes = string.IsNullOrWhiteSpace(detail) ? "" : $" Changes: {detail.Trim()}";
        Push(s, Audit(
            $"Booking rules saved (Peak season {(settings.PeakSeason ? "ON" : "OFF")}; cottage hold {settings.Hold.Regular.CottageHours}h / peak {settings.Hold.Peak.CottageHours}h; pool hold {settings.Hold.Regular.PoolHours}h / peak {settings.Hold.Peak.PoolHours}h; cancellation {settings.CancellationHours}h).{changes}",
            null, by));
    });

    public void SaveTariff(Tariff tariff, string by) => Edit(s =>
    {
        s.Tariff = tariff;
        Push(s, Audit("Updated tariff rates", null, by));
    });

    public void SaveOpsConfig(OpsConfig config, string by) => Edit(s =>
    {
        s.OpsConfig = config;
        Push(s, Audit("Updated lifeguard ratio settings", null, by));
    });

    public void SaveAddon(Addon addon, string by) => Edit(s =>
    {
        var i = s.Addons.FindIndex(x => x.Id == addon.Id);
        s.Addons = i >= 0 ? [.. s.Addons[..i], addon, .. s.Addons[(i + 1)..]] : [.. s.Addons, addon];
        Push(s, Audit($"{(i >= 0 ? "Updated" : "Added")} add-on: {addon.Name}", null, by));
    });

    // ------------------------------------------------------------ background tick

    public void Tick()
    {
        var changed = false;
        lock (_gate)
        {
            var s = _state;
            var now = Ops.NowMs();
            var local = DateTime.Now;
            var st = s.Settings;
            string[] live = [BookingStatus.Confirmed, BookingStatus.Reserved];

            long Deadline(Booking b) => b.PaymentDeadline is null ? long.MaxValue : Ops.UnixMs(b.PaymentDeadline);
            bool Unpaid(Booking b) => b.Status == BookingStatus.Pending && b.PaymentStatus == PaymentStatus.Unpaid && b.PaymentDeadline is not null;
            bool Expired(Booking b) => Unpaid(b) && Deadline(b) <= now;
            bool Warn(Booking b) => Unpaid(b) && b.WarnedAt is null && Deadline(b) - now <= 15 * 60_000 && Deadline(b) > now;
            bool Remind(Booking b) =>
                b.ReminderSentAt is null && !b.AttendanceConfirmed && live.Contains(b.Status) && Ops.NeedsConfirmation(b, st) &&
                Ops.HoursUntil(b) <= st.ConfirmationHours && Ops.HoursUntil(b) > 0;
            bool NoShow(Booking b) => live.Contains(b.Status) && Ops.SlotStart(b.Date, b.SlotId).AddMinutes(30) <= local;

            var expired = s.Bookings.Where(Expired).ToList();
            var warn = s.Bookings.Where(Warn).ToList();
            var remind = s.Bookings.Where(Remind).ToList();
            var noShow = s.Bookings.Where(NoShow).ToList();
            var holdsExpired = s.Holds.Any(h => Ops.UnixMs(h.ExpiresAt) <= now);
            if (expired.Count + warn.Count + remind.Count + noShow.Count > 0 || holdsExpired)
            {
                changed = true;
                var stamp = Ops.NowIso();
                s.Holds = s.Holds.Where(h => Ops.UnixMs(h.ExpiresAt) > now).ToList();
                foreach (var b in s.Bookings)
                {
                    if (Expired(b)) b.Status = BookingStatus.Expired;
                    else if (NoShow(b)) b.Status = BookingStatus.NoShow;
                    else if (Remind(b)) b.ReminderSentAt = stamp;
                    else if (Warn(b)) b.WarnedAt = stamp;
                }
                s.Notices = Prepend(s.Notices,
                    expired.Select(b => MakeNotice(NoticeAudience.Guest, $"Hold expired for {b.Id}. The slot is available to others again.", b.GuestId, b.Id))
                    .Concat(warn.Select(b => MakeNotice(NoticeAudience.Guest, $"Your hold for {b.Id} ends soon. Pay now to keep the slot.", b.GuestId, b.Id)))
                    .Concat(remind.Select(b => MakeNotice(NoticeAudience.Guest, $"Please confirm your attendance for {b.Id} ({b.Date}) within {st.ConfirmationHours} hours of the slot.", b.GuestId, b.Id))));
                s.AuditLog = Prepend(s.AuditLog,
                    expired.Select(b => Audit("Hold expired; slot released", b.Id, "System"))
                    .Concat(noShow.Select(b => Audit("Marked no-show after 30-minute grace period", b.Id, "System")))
                    .Concat(remind.Select(b => Audit("Auto-sent attendance reminder", b.Id, "System"))));
            }
            // Day-before in-app reminders, then offer freed space to the waitlist (the order matches the React reducer).
            var reminded = DayBeforeReminders(s);
            var promoted = PromoteWaitlist(s);
            if (reminded || promoted) changed = true;
            if (changed) _persistence?.Save(s);
        }
        if (changed) Changed?.Invoke();
    }
}
