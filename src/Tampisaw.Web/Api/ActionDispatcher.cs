using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Tampisaw.Models;
using Tampisaw.Services;

namespace Tampisaw.Api;

/// <summary>
/// Every change the browser asks for arrives here as one JSON action ({ "type": "CANCEL", "id": "TMP-1101" }).
/// The dispatcher (1) checks who is asking and whether their role may do it, (2) validates the input on the server,
/// (3) refuses anything that would double-book a slot or a cottage, and (4) applies the change through AppStore,
/// which writes it to the database. All actions run one at a time, so "check availability, then book" cannot race.
/// </summary>
public sealed partial class ActionDispatcher(AppStore store)
{
    private readonly object _gate = new();
    private const int MaxImageChars = 1_800_000;   // ~1.3 MB image as a data URL
    private const int MaxText = 2000;

    private static readonly string[] AllRoles = [Roles.Guest, Roles.Receptionist, Roles.Admin];
    private static readonly string[] BookableSlots = [SlotIds.DayTour, SlotIds.NightSwim, SlotIds.RoomStay, SlotIds.Event];
    private static readonly string[] BookingTypes = [BookingType.Pool, BookingType.Cottage, BookingType.Room, BookingType.Event];
    private static readonly string[] LiveForGuest = [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed];
    private static readonly string[] EndedStatuses = [BookingStatus.Cancelled, BookingStatus.NoShow, BookingStatus.Expired, BookingStatus.Completed, BookingStatus.CheckedOut];

    public DispatchResult Handle(Actor? actor, JsonElement action)
    {
        if (action.ValueKind != JsonValueKind.Object || !action.TryGetProperty("type", out var t) || t.ValueKind != JsonValueKind.String)
            return DispatchResult.Fail("Unknown request.");
        var type = t.GetString()!;
        var a = new Args(action);
        lock (_gate)
        {
            // Everything written to the audit log during this request carries the signed-in person's real name and role.
            using var _ = actor is null ? null : AppStore.ActAs(actor.Name, actor.Role);
            try { return Run(actor, type, a); }
            catch (BadRequest ex) { return DispatchResult.Fail(ex.Message); }
            catch (JsonException) { return DispatchResult.Fail("The request was not in the expected format."); }
        }
    }

    // ------------------------------------------------------------------------------------------ routing

    private DispatchResult Run(Actor? actor, string type, Args a)
    {
        switch (type)
        {
            // ---- guest booking flow
            case "HOLD": return Guarded(actor, AllRoles, () => Hold(actor!, a.Obj("payload")));
            case "RELEASE_HOLD": return Guarded(actor, AllRoles, () => { ReleaseHold(actor!, a.Str("id")); return Ok(); });
            case "CREATE_BOOKING": return Guarded(actor, [Roles.Guest], () => CreateBooking(actor!, a.Model<Booking>("payload")));
            case "PAYMENT_PROOF": return Guarded(actor, [Roles.Guest], () => PaymentProof(actor!, a));
            case "BALANCE_PROOF": return Guarded(actor, [Roles.Guest], () => BalanceProof(actor!, a));
            case "CONFIRM_ATTENDANCE": return Guarded(actor, [Roles.Guest], () => { OwnLive(actor!, a.Str("id")); store.ConfirmAttendance(a.Str("id")); return Ok(); });
            case "REQUEST_CANCEL": return Guarded(actor, [Roles.Guest], () => RequestCancel(actor!, a.Str("id"), a.StrOpt("reason")));
            case "SET_QR_TOKEN": return Guarded(actor, [Roles.Guest], () => ResignQr(actor!, a.Str("id")));
            case "JOIN_WAITLIST": return Guarded(actor, [Roles.Guest], () => JoinWaitlist(actor!, a.Obj("entry")));
            case "LEAVE_WAITLIST": return Guarded(actor, [Roles.Guest], () => LeaveWaitlist(actor!, a.Str("id")));

            // ---- front desk and admin: bookings and money
            case "VERIFY_PAYMENT": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.VerifyPayment(a.Str("id"), a.Bool("approved"), actor!.Name, actor.Role); return Ok(); });
            case "BALANCE_PROOF_REJECT": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.RejectBalanceProof(a.Str("id"), actor!.Name); return Ok(); });
            case "ADD_WALK_IN": return Guarded(actor, Roles.Staff, () => WalkIn(actor!, a.Model<Booking>("payload")));
            case "CANCEL": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.Cancel(a.Str("id"), actor!.Name, Clean(a.StrOpt("reason"), 500)); return Ok(); });
            case "ARCHIVE_BOOKING": return Guarded(actor, Roles.Staff, () => Done(store.ArchiveBooking(a.Str("id", 100), actor!.Name)));
            case "RESTORE_BOOKING": return Guarded(actor, Roles.Staff, () => Done(store.RestoreBooking(a.Str("id", 100), actor!.Name)));
            case "DELETE_BOOKING_PERMANENT": return Guarded(actor, Roles.AdminLevel, () => Done(store.DeleteBookingPermanently(a.Str("id", 100), actor!.Name)));
            case "ARCHIVE_GUEST": return Guarded(actor, Roles.AdminLevel, () => Done(store.SetGuestArchived(a.Str("id", 100), true, actor!.Name)));
            case "RESTORE_GUEST": return Guarded(actor, Roles.AdminLevel, () => Done(store.SetGuestArchived(a.Str("id", 100), false, actor!.Name)));
            case "RESCHEDULE": return Guarded(actor, Roles.Staff, () => Reschedule(actor!, a.Str("id"), a.Str("date"), a.Str("slotId")));
            case "CHECK_IN": return Guarded(actor, Roles.Staff, () => CheckIn(actor!, a.Str("id")));
            case "MARK_NO_SHOW": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.MarkNoShow(a.Str("id"), actor!.Name); return Ok(); });
            case "PAY_BALANCE": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.PayBalance(a.Str("id"), "online", actor!.Name); return Ok(); });
            case "COLLECT_PAYMENT": return Guarded(actor, Roles.Staff, () => Collect(actor!, a));
            case "SEND_REMINDER": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.SendReminder(a.Str("id"), actor!.Name); return Ok(); });
            case "PROCESS_CANCEL": return Guarded(actor, Roles.Staff, () => ProcessCancel(actor!, a));
            case "ISSUE_BRACELETS": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.IssueBracelets(a.Str("id"), actor!.Name); return Ok(); });
            case "SPOT_CHECK": return Guarded(actor, Roles.Staff, () => SpotCheck(actor!, a));
            case "REPLACE_BRACELET": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.ReplaceBracelet(a.Str("id"), a.Str("reason", 300), actor!.Name); return Ok(); });
            case "TIME_OUT": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.TimeOut(a.Str("id"), a.Bool("returned"), actor!.Name); return Ok(); });
            case "BILL_OVERTIME": return Guarded(actor, Roles.Staff, () => BillOvertime(actor!, a));
            case "EXPIRY_ALERT": return Guarded(actor, Roles.Staff, () => { Exists(a.Str("id")); store.SendExpiryAlert(a.Str("id")); return Ok(); });
            case "ADD_DAMAGE_FEE": return Guarded(actor, Roles.Staff, () => AddDamageFee(actor!, a));
            case "SETTLE_DAMAGE_FEE": return Guarded(actor, Roles.Staff, () => { store.SettleDamageFee(a.Str("guestId"), a.Str("feeId"), actor!.Name); return Ok(); });
            case "POOL_LOG": return Guarded(actor, Roles.Staff, () => PoolLog(actor!, a.Model<PoolLog>("payload")));
            case "QUEUE_SYNC": return Guarded(actor, Roles.Staff, () => { var item = a.Model<SyncItem>("item"); item.By = actor!.Name; store.QueueSync(item); return Ok(); });
            case "SYNC_QUEUE": return Guarded(actor, Roles.Staff, () => { store.MarkSynced(); return Ok(); });
            case "SAVE_SHIFT": return Guarded(actor, Roles.Staff, () => { var r = a.Model<ShiftReport>("report"); r.By = actor!.Name; store.SaveShift(r); return Ok(); });

            // ---- incidents and maintenance (guests may report and answer on their own)
            case "ADD_INCIDENT": return Guarded(actor, AllRoles, () => AddIncident(actor!, a.Model<Incident>("payload")));
            case "UPDATE_INCIDENT": return Guarded(actor, AllRoles, () => UpdateIncident(actor!, a));
            case "ADD_MAINT": return Guarded(actor, AllRoles, () => AddMaint(actor!, a.Model<MaintenanceRequest>("payload")));
            case "UPDATE_MAINT": return Guarded(actor, AllRoles, () => UpdateMaint(actor!, a));

            // ---- administrator only
            case "UPDATE_SLOT": return Guarded(actor, Roles.AdminLevel, () => UpdateSlot(actor!, a.Model<Slot>("payload")));
            case "UPDATE_COTTAGE": return Guarded(actor, Roles.AdminLevel, () => UpdateCottage(actor!, a.Model<Cottage>("payload")));
            case "SAVE_POLICY": return Guarded(actor, Roles.AdminLevel, () => SavePolicy(actor!, a.Model<Policy>("policy")));
            case "DELETE_POLICY": return Guarded(actor, Roles.AdminLevel, () => { store.DeletePolicy(a.Str("id"), actor!.Name); return Ok(); });
            case "ADD_BLACKOUT": return Guarded(actor, Roles.AdminLevel, () => AddBlackout(actor!, a));
            case "REMOVE_BLACKOUT": return Guarded(actor, Roles.AdminLevel, () => { store.RemoveBlackout(a.Str("id"), actor!.Name); return Ok(); });
            case "SET_BLACKOUT_KIND": return Guarded(actor, Roles.AdminLevel, () => { store.SetBlackoutKind(a.Str("id"), OneOf(a.Str("kind"), [BlackoutKind.Closure, BlackoutKind.Maintenance, BlackoutKind.Weather], "closure type"), actor!.Name); return Ok(); });

            // ---- root admin only: staff accounts (receptionist and admin logins)
            case "CREATE_STAFF_USER": return Guarded(actor, [Roles.RootAdmin], () => Done(store.CreateStaffUser(a.Str("name", 120), a.Str("email", 254), a.Str("phone", 30), a.Str("role", 30), a.Str("password", 200), actor!.Name)));
            case "UPDATE_STAFF_USER": return Guarded(actor, [Roles.RootAdmin], () => Done(store.UpdateStaffUser(a.Str("id", 100), a.Str("name", 120), a.Str("email", 254), a.Str("phone", 30), a.Str("role", 30), actor!.Name)));
            case "ARCHIVE_USER": return Guarded(actor, [Roles.RootAdmin], () => Done(store.SetUserArchived(a.Str("id", 100), true, actor!.Name)));
            case "RESTORE_USER": return Guarded(actor, [Roles.RootAdmin], () => Done(store.SetUserArchived(a.Str("id", 100), false, actor!.Name)));
            case "DELETE_STAFF_USER": return Guarded(actor, [Roles.RootAdmin], () => Done(store.DeleteStaffUser(a.Str("id", 100), actor!.Name)));
            case "SET_USER_PASSWORD": return Guarded(actor, [Roles.RootAdmin], () => Done(store.SetUserPassword(a.Str("id", 100), a.Str("password", 200), actor!.Name)));
            case "SAVE_SETTINGS": return Guarded(actor, Roles.AdminLevel, () => SaveSettings(actor!, a));
            case "SAVE_TARIFF": return Guarded(actor, Roles.AdminLevel, () => SaveTariff(actor!, a.Model<Tariff>("tariff")));
            case "SAVE_OPS_CONFIG": return Guarded(actor, Roles.AdminLevel, () => SaveOps(actor!, a.Model<OpsConfig>("config")));
            case "SAVE_ADDON": return Guarded(actor, Roles.AdminLevel, () => SaveAddon(actor!, a.Model<Addon>("addon")));
            case "ASSIGN_SHIFT": return Guarded(actor, Roles.AdminLevel, () => AssignShift(actor!, a));
            case "UNASSIGN_SHIFT": return Guarded(actor, Roles.AdminLevel, () => { store.UnassignShift(a.Str("id"), actor!.Name); return Ok(); });
            case "BULK_NOTIFY": return Guarded(actor, Roles.AdminLevel, () => BulkNotify(actor!, a));
            case "WEATHER_CANCEL": return Guarded(actor, Roles.AdminLevel, () => Weather(actor!, a));
            case "DELETE_USER": return Guarded(actor, AllRoles, () => DeleteUser(actor!, a.Str("id")));

            default:
                return DispatchResult.Fail("That action is not supported.");
        }
    }

    private static DispatchResult Ok(string? bookingId = null) => DispatchResult.Success(bookingId);

    private static DispatchResult Done(OpResult r) => r.Ok ? Ok() : DispatchResult.Fail(r.Error ?? "That could not be done.");

    private static DispatchResult Guarded(Actor? actor, string[] roles, Func<DispatchResult> run)
    {
        if (actor is null) return DispatchResult.Fail("Please log in to continue.", 401);
        if (!roles.Contains(actor.Role)) return DispatchResult.Fail("Your account is not allowed to do that.", 403);
        return run();
    }


    private sealed class BadRequest(string message) : Exception(message);

    private static BadRequest Bad(string message) => new(message);

    private Booking Exists(string id) => store.FindBooking(id) ?? throw Bad("That booking could not be found.");

    private Booking Own(Actor actor, string id)
    {
        var b = Exists(id);
        if (string.IsNullOrEmpty(actor.GuestId) || b.GuestId != actor.GuestId) throw Bad("That booking could not be found.");
        return b;
    }

    private Booking OwnLive(Actor actor, string id)
    {
        var b = Own(actor, id);
        if (!LiveForGuest.Contains(b.Status)) throw Bad($"This booking is {b.Status.Replace('-', ' ')} and can no longer be changed.");
        return b;
    }

    private static string OneOf(string value, string[] allowed, string label) =>
        allowed.Contains(value) ? value : throw Bad($"Invalid {label}.");

    private static string Clean(string? v, int max = MaxText) => (v ?? "").Trim() is var t && t.Length > max ? t[..max] : (v ?? "").Trim();

    private static bool IsDate(string? v) =>
        v is not null && DateOnly.TryParseExact(v, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static void CheckImage(string? image)
    {
        if (string.IsNullOrEmpty(image)) return;
        if (image.Length > MaxImageChars) throw Bad("That image is too large. Please upload a smaller photo.");
        if (!IsJpegOrPngDataUrl(image)) throw Bad(ImageRules.ErrorMessage);
    }

    /// <summary>Uploads arrive as data URLs; only JPG/JPEG/PNG pictures are accepted.</summary>
    public static bool IsJpegOrPngDataUrl(string v) =>
        v.StartsWith("data:image/jpeg;base64,", StringComparison.OrdinalIgnoreCase) ||
        v.StartsWith("data:image/png;base64,", StringComparison.OrdinalIgnoreCase);

    [GeneratedRegex(@"^[A-Za-z0-9._-]{1,100}$")]
    private static partial Regex SafeId();

    private static void CheckId(string id, string what)
    {
        if (!SafeId().IsMatch(id)) throw Bad($"Invalid {what}.");
    }


    private DispatchResult Hold(Actor actor, JsonElement p)
    {
        var id = p.Prop("id");
        CheckId(id, "hold id");
        var date = p.Prop("date");
        var eventStart = p.Prop("eventStart") is { Length: > 0 } es ? Clean(es, 20) : null;
        var owner = string.IsNullOrEmpty(actor.GuestId) ? null : actor.GuestId;
        var slot = Ops.CanonicalSlotId(p.Prop("slotId"));
        var guests = p.TryGetProperty("guests", out var g) && g.TryGetInt32(out var n) ? n : 0;
        var cottageId = p.TryGetProperty("cottageId", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        OneOf(slot, BookableSlots, "time slot");
        if (guests < 0 || guests > 500) throw Bad("Invalid number of guests.");

        var msg = store.Read(s =>
        {
            var draft = new DraftBooking { Date = date, SlotId = slot, Guests = guests, CottageId = string.IsNullOrEmpty(cottageId) ? null : cottageId, EventStart = eventStart };
            // The guest's own earlier hold (this one, or one from another tab) never counts against them.
            var conflict = Ops.FindConflict(s, draft, null, id, owner);
            if (conflict is not null) return conflict;
            // Seats already promised to other guests who are still checking out.
            var def = Ops.ResolveSlot(s.Slots, slot);
            var now = Ops.NowMs();
            var held = s.Holds.Where(h => h.Id != id && (owner is null || h.GuestId != owner) && h.Date == date && Ops.CanonicalSlotId(h.SlotId) == slot && Ops.UnixMs(h.ExpiresAt) > now).Sum(h => h.Guests);
            var used = s.Bookings.Where(b => b.Date == date && Ops.CanonicalSlotId(b.SlotId) == slot && Ops.BlocksAvailability(b)).Sum(b => b.Guests);
            if (def is not null && used + held + guests > def.Capacity)
                return $"{def.Label} is full for this date ({Math.Max(0, def.Capacity - used - held)} spots left). Please choose another slot.";
            if (draft.CottageId is not null)
            {
                var item = s.Cottages.FirstOrDefault(x => x.Id == draft.CottageId);
                if (item is not null && Ops.UnitAvailability(s, item, date, slot, eventStart, null, id, owner) is { Left: <= 0 } unit)
                    return unit.BlockedBy ?? (item.Kind == CottageKind.Event
                        ? "That pavilion is already reserved (or being reserved by another guest) for this date and time block. Please choose another one."
                        : "That cottage / room is being reserved by another guest right now. Please choose another one.");
            }
            return null;
        });
        if (msg is not null) return DispatchResult.Fail(msg);
        store.PlaceHold(id, date, slot, guests, string.IsNullOrEmpty(cottageId) ? null : cottageId, eventStart, owner);
        return Ok();
    }

    /// <summary>A guest can only release their own hold; staff can release any.</summary>
    private void ReleaseHold(Actor actor, string id)
    {
        var mine = store.Read(s => s.Holds.FirstOrDefault(h => h.Id == id));
        if (mine is null) return;
        if (actor.IsGuest && mine.GuestId != actor.GuestId) throw Bad("That hold could not be found.");
        store.ReleaseHold(id);
    }

    private string NextFreeBookingId(string? wanted)
    {
        if (wanted is not null && Regex.IsMatch(wanted, @"^TMP-\d{4,9}$") && store.FindBooking(wanted) is null) return wanted;
        return store.NextBookingId();
    }

    // ------------------------------------------------------------------------------------------ guest bookings

    private DispatchResult CreateBooking(Actor actor, Booking b)
    {
        if (string.IsNullOrEmpty(actor.GuestId)) throw Bad("Your guest profile could not be found.");
        var user = store.FindUser(actor.UserId) ?? throw Bad("Your account could not be found.");

        var date = b.Date;
        var slot = Ops.CanonicalSlotId(b.SlotId ?? "");
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        OneOf(slot, BookableSlots, "time slot");
        OneOf(b.Type ?? "", BookingTypes, "booking type");
        if (b.Guests < 1 || b.Guests > 500) throw Bad("Enter the number of guests (1 to 500).");
        var phone = Ops.CanonicalPhone(Clean(b.Phone ?? user.Phone, 30)) ?? throw Bad("Enter a valid mobile number: 09XXXXXXXXX or +639XXXXXXXXX.");
        var name = Clean(string.IsNullOrWhiteSpace(b.GuestName) ? user.Name : b.GuestName, 120);
        if (!Ops.IsValidName(name)) throw Bad("Enter a valid name (letters only).");

        Booking created = null!;
        var error = store.Read(s =>
        {
            // ---- the space they want
            Cottage? space = null;
            if (b.Type == BookingType.Pool)
            {
                b.CottageId = null;
            }
            else
            {
                space = s.Cottages.FirstOrDefault(c => c.Id == b.CottageId);
                if (space is null) return "Choose a cottage, room or event place for this booking.";
                var want = b.Type switch { BookingType.Room => CottageKind.Room, BookingType.Event => CottageKind.Event, _ => CottageKind.Cottage };
                if (space.Kind != want) return "That space does not match the booking type.";
                if (space.Status == CottageStatus.Maintenance) return $"{space.Name} is under maintenance and cannot be booked.";
            }

            // ---- availability: closed days, blackouts, capacity, cottage taken, double booking by the same guest
            var draft = new DraftBooking
            {
                Date = date,
                SlotId = slot,
                Guests = b.Guests,
                Type = b.Type!,
                CottageId = b.CottageId,
                EventStart = b.EventStart,
                Mix = b.Mix,
                Adults = b.Adults ?? 0,
                Children = b.Children ?? 0,
                Addons = b.Addons,
            };
            // The guest's own checkout hold is not "another guest": without this a single-unit space (pavilion, family room,
            // canteen) would block the very person who is booking it.
            var conflict = Ops.FindConflict(s, draft, null, null, actor.GuestId);
            if (conflict is not null) return conflict;
            var dup = Ops.FindDuplicate(s, actor.GuestId, date, slot);
            if (dup is not null) return $"You already have booking {dup.Id} for this date and session.";

            // ---- price it on the server; the browser's totals are ignored
            if (b.Type is BookingType.Pool or BookingType.Cottage)
            {
                b.Mix ??= new GuestMix { Adult = b.Adults ?? b.Guests, Child = b.Children ?? 0 };
                if (b.Mix.Total != b.Guests) return "The guest types must add up to the number of guests.";
                if (b.Mix.Adult + b.Mix.Senior + b.Mix.Pwd < 1) return "At least one adult, senior or PWD guest must supervise the group.";
                if (new[] { b.Mix.Adult, b.Mix.Child, b.Mix.Senior, b.Mix.Pwd }.Any(x => x < 0)) return "Guest counts cannot be negative.";
            }
            else b.Mix = new GuestMix();

            var addons = new List<BookingAddon>();
            foreach (var wanted in (b.Addons ?? []).Where(x => x.Qty > 0))
            {
                var def = s.Addons.FirstOrDefault(x => x.Id == wanted.Id && x.Active);
                if (def is null) return "One of the selected add-ons is no longer offered.";
                if (wanted.Qty > Ops.AddonLeft(s, def, date)) return $"Only {Ops.AddonLeft(s, def, date)} of {def.Name} are left for that date.";
                addons.Add(new BookingAddon { Id = def.Id, Name = def.Name, Qty = wanted.Qty, Price = def.Price, Deposit = def.Deposit });
            }
            b.Addons = addons;
            draft.Addons = addons;
            draft.Mix = b.Mix;
            var (ledger, _, total) = Ops.LedgerOfDraft(s, draft, space);
            b.Total = total;
            b.AddonDeposit = ledger.AddonDeposit;
            b.PaymentOption = b.Type == BookingType.Pool ? PaymentOption.Full : OneOf(string.IsNullOrEmpty(b.PaymentOption) ? PaymentOption.Partial : b.PaymentOption, [PaymentOption.Partial, PaymentOption.Full], "payment option");
            b.DueNow = Ops.RequiredNow(b.Type!, total, s.Settings, b.PaymentOption);
            b.Adults = b.Mix.Adult + b.Mix.Senior + b.Mix.Pwd;
            b.Children = b.Mix.Child;
            b.Discounts = 0;
            if (b.Type == BookingType.Cottage) b.CottageHours = Math.Max(1, Math.Min(b.CottageHours ?? 1, Ops.DurationCapFor(s.Tariff, slot)));
            return null;
        });
        if (error is not null) return DispatchResult.Fail(error);

        var source = Clean(b.Source ?? BookingSource.Online, 30);
        if (string.Equals(source, BookingSource.Online, StringComparison.OrdinalIgnoreCase) && b.PaymentMethod is not null && !string.Equals(b.PaymentMethod, PayMethod.Qr, StringComparison.OrdinalIgnoreCase))
            throw Bad("Online guest bookings must use the official e-wallet payment flow.");
        var payMethod = b.PaymentMethod is PayMethod.Cash or PayMethod.Qr ? b.PaymentMethod : PayMethod.Qr;
        if (string.Equals(source, BookingSource.Online, StringComparison.OrdinalIgnoreCase)) payMethod = PayMethod.Qr;
        var now = DateTime.UtcNow;
        var holdHours = store.Read(s => Ops.HoldHoursFor(s.Settings, b.Type!, (Ops.SlotStart(date, slot) - DateTime.Now).TotalHours));

        created = new Booking
        {
            Id = NextFreeBookingId(b.Id),
            GuestId = actor.GuestId,
            GuestName = name,
            Email = Clean(string.IsNullOrWhiteSpace(b.Email) ? user.Email : b.Email, 256),
            Phone = phone,
            Date = date,
            SlotId = slot,
            Guests = b.Guests,
            Type = b.Type!,
            CottageId = b.CottageId,
            CottageHours = b.CottageHours,
            Status = BookingStatus.Pending,
            Risk = Risk.Medium,
            Paid = 0,
            Total = b.Total,
            DueNow = b.DueNow,
            PaymentOption = b.PaymentOption,
            Receipt = Receipt.None,
            CreatedAt = Ops.FormatIso(now),
            Adults = b.Adults,
            Children = b.Children,
            Discounts = 0,
            Mix = b.Mix,
            Addons = b.Addons,
            AddonDeposit = b.AddonDeposit,
            Waiver = b.Waiver,
            PaymentStatus = PaymentStatus.Unpaid,
            PaymentMethod = payMethod,
            PaymentDeadline = Ops.FormatIso(now.AddHours(holdHours)),
            Source = BookingSource.Online,
            EventStart = b.Type == BookingType.Event ? Clean(b.EventStart, 20) : null,
            ArrivalDate = payMethod == PayMethod.Cash && IsDate(b.ArrivalDate) ? b.ArrivalDate : null,
            ArrivalTime = payMethod == PayMethod.Cash ? Clean(b.ArrivalTime, 20) : null,
        };
        created.QrToken = Ops.SignQrToken(created);
        store.CreateBooking(created);
        return Ok(created.Id);
    }

    private DispatchResult PaymentProof(Actor actor, Args a)
    {
        var b = Own(actor, a.Str("id"));
        if (!LiveForGuest.Contains(b.Status)) throw Bad("This booking can no longer accept a payment proof.");
        if (b.PaymentStatus is PaymentStatus.Verified) throw Bad("This booking's payment was already verified.");
        if (b.Source == BookingSource.Online && !string.Equals(a.Str("method"), PayMethod.Qr, StringComparison.OrdinalIgnoreCase))
            throw Bad("Online guest bookings must use the official e-wallet payment flow.");
        var method = OneOf(a.Str("method"), [PayMethod.Cash, PayMethod.Qr], "payment method");
        var proofName = Clean(a.StrOpt("proofName"), 200);
        if (string.IsNullOrWhiteSpace(proofName)) throw Bad("Add the payment proof name.");
        var image = a.StrOpt("proofImage");
        if (method == PayMethod.Qr && string.IsNullOrWhiteSpace(image)) throw Bad("Upload the e-wallet payment proof image.");
        CheckImage(image);
        if (b.PaymentStatus == PaymentStatus.Rejected)
        {
            // A rejected payment released the date and space, so make sure nobody else took them before accepting a new proof.
            var taken = store.Read(s => Ops.FindConflict(s, new DraftBooking
            {
                Date = b.Date, SlotId = b.SlotId, Guests = b.Guests, Type = b.Type, CottageId = b.CottageId, EventStart = b.EventStart,
            }, b.Id, null, actor.GuestId));
            if (taken is not null) throw Bad("Sorry, that date and space were taken while your payment was being reviewed. Please make a new booking. " + taken);
        }
        store.SubmitPaymentProof(b.Id, method, proofName, image);
        return Ok();
    }

    private DispatchResult BalanceProof(Actor actor, Args a)
    {
        var b = OwnLive(actor, a.Str("id"));
        if (Ops.BalanceOf(b) <= 0) throw Bad("This booking has no balance to pay.");
        var image = a.StrOpt("image");
        CheckImage(image);
        store.SubmitBalanceProof(b.Id, a.Str("name", 200), image);
        return Ok();
    }

    private DispatchResult RequestCancel(Actor actor, string id, string? reason)
    {
        var b = OwnLive(actor, id);
        if (b.Status == BookingStatus.CheckedIn) throw Bad("You are already checked in.");
        store.RequestCancel(b.Id, string.IsNullOrWhiteSpace(reason) ? null : Clean(reason, 500));
        return Ok();
    }

    private DispatchResult ResignQr(Actor actor, string id)
    {
        var b = Own(actor, id);
        store.SetQrToken(b.Id, Ops.SignQrToken(b));
        return Ok();
    }

    private DispatchResult JoinWaitlist(Actor actor, JsonElement entry)
    {
        var e = entry.Deserialize<WaitlistEntry>(ApiJson.Options) ?? throw Bad("Invalid waitlist request.");
        if (!IsDate(e.Date)) throw Bad("Choose a valid date.");
        e.SlotId = OneOf(Ops.CanonicalSlotId(e.SlotId ?? ""), BookableSlots, "time slot");
        if (e.Guests < 1 || e.Guests > 500) throw Bad("Enter the number of guests.");
        var user = store.FindUser(actor.UserId)!;
        e.GuestId = actor.GuestId ?? throw Bad("Your guest profile could not be found.");
        e.Name = user.Name;
        e.Phone = user.Phone;
        var result = store.JoinWaitlist(e);
        return result is null ? DispatchResult.Fail("You are already on the waitlist for that session.") : Ok();
    }

    private DispatchResult LeaveWaitlist(Actor actor, string id)
    {
        var mine = store.Read(s => s.Waitlist.Any(w => w.Id == id && w.GuestId == actor.GuestId));
        if (!mine) throw Bad("That waitlist entry could not be found.");
        store.LeaveWaitlist(id);
        return Ok();
    }

    // ------------------------------------------------------------------------------------------ front desk

    private DispatchResult WalkIn(Actor actor, Booking b)
    {
        if (!IsDate(b.Date)) throw Bad("Choose a valid date.");
        b.SlotId = OneOf(Ops.CanonicalSlotId(b.SlotId ?? ""), BookableSlots, "time slot");
        OneOf(b.Type ?? "", BookingTypes, "booking type");
        if (b.Guests < 0 || b.Guests > 500) throw Bad("Invalid number of guests.");
        if (b.Total < 0 || b.Paid < 0 || b.Paid > b.Total + (b.AddonDeposit ?? 0)) throw Bad("The amounts are not valid.");
        if (string.IsNullOrWhiteSpace(b.Id) || !Regex.IsMatch(b.Id, @"^TMP-\d{4,9}$")) throw Bad("Invalid booking number.");
        if (store.FindBooking(b.Id) is not null) throw Bad($"Booking number {b.Id} was just used by someone else. Please try again.");
        if (!string.IsNullOrWhiteSpace(b.Phone) && Ops.CanonicalPhone(b.Phone) is null) throw Bad("Enter a valid mobile number (09XXXXXXXXX or +639XXXXXXXXX), or leave it empty.");
        if (!string.IsNullOrEmpty(b.PaymentMethod)) OneOf(b.PaymentMethod, [PayMethod.Cash, PayMethod.Qr], "payment method");

        var error = store.Read(s =>
        {
            var draft = new DraftBooking { Date = b.Date, SlotId = b.SlotId, Guests = b.Guests, Type = b.Type!, CottageId = b.CottageId, EventStart = b.EventStart };
            if (b.CottageId is not null && s.Cottages.All(c => c.Id != b.CottageId)) return "That cottage or room does not exist.";
            return Ops.FindConflict(s, draft);
        });
        if (error is not null) return DispatchResult.Fail(error);

        b.GuestId = "walk-in";
        b.Source = BookingSource.WalkIn;
        b.GuestName = Clean(b.GuestName, 120);
        b.Email = "";
        b.Phone = string.IsNullOrWhiteSpace(b.Phone) ? null : Ops.CanonicalPhone(b.Phone);
        b.CreatedAt ??= Ops.NowIso();
        b.QrToken = Ops.SignQrToken(b);
        b.Status = OneOf(b.Status, [BookingStatus.CheckedIn, BookingStatus.Reserved, BookingStatus.Confirmed], "status");
        b.Bracelets = [];
        store.AddWalkIn(b, actor.Name);
        return Ok(b.Id);
    }

    private DispatchResult Reschedule(Actor actor, string id, string date, string slotId)
    {
        var b = Exists(id);
        if (EndedStatuses.Contains(b.Status) || b.Status == BookingStatus.CheckedIn) throw Bad($"A {b.Status.Replace('-', ' ')} booking cannot be rescheduled.");
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        var slot = OneOf(Ops.CanonicalSlotId(slotId), BookableSlots, "time slot");
        var conflict = store.Read(s => Ops.FindConflict(s, new DraftBooking
        {
            Date = date,
            SlotId = slot,
            Guests = b.Guests,
            Type = b.Type,
            CottageId = b.CottageId,
            EventStart = b.EventStart,
        }, b.Id));
        if (conflict is not null) return DispatchResult.Fail(conflict);
        store.Reschedule(id, date, slot, actor.Name);
        var moved = store.FindBooking(id)!;
        store.SetQrToken(id, Ops.SignQrToken(moved));
        return Ok();
    }

    private DispatchResult CheckIn(Actor actor, string id)
    {
        var b = Exists(id);
        if (b.Status == BookingStatus.CheckedIn) throw Bad("This booking is already checked in.");
        if (EndedStatuses.Contains(b.Status)) throw Bad($"This booking is {b.Status.Replace('-', ' ')} and cannot be checked in.");
        store.CheckIn(id, actor.Name);
        return Ok();
    }

    private DispatchResult Collect(Actor actor, Args a)
    {
        var b = Exists(a.Str("id"));
        var amount = a.Int("amount");
        var method = OneOf(a.StrOpt("method") ?? "cash", [BalanceMethod.Cash, BalanceMethod.Gcash], "payment method");
        if (amount <= 0) throw Bad("Enter an amount greater than zero.");
        if (amount > Ops.BalanceOf(b)) throw Bad($"The amount is more than the remaining balance ({Ops.Peso(Ops.BalanceOf(b))}).");
        if (b.Status is BookingStatus.Cancelled or BookingStatus.Expired or BookingStatus.NoShow) throw Bad("Payments cannot be recorded on a cancelled booking.");
        store.CollectPayment(b.Id, amount, actor.Name, a.StrOpt("note"), method);
        return Ok();
    }

    private DispatchResult ProcessCancel(Actor actor, Args a)
    {
        var b = Exists(a.Str("id"));
        var amount = a.Int("amount");
        if (amount < 0 || amount > b.Paid) throw Bad("The refund cannot be more than what the guest paid.");
        store.ProcessCancel(b.Id, actor.Name, a.Bool("eligible"), amount, a.StrOpt("reason"));
        return Ok();
    }

    private DispatchResult SpotCheck(Actor actor, Args a)
    {
        var bookingId = a.StrOpt("bookingId");
        if (bookingId is not null) Exists(bookingId);
        var result = OneOf(a.Str("result"), [SpotCheckResult.Ok, SpotCheckResult.WrongService, SpotCheckResult.Transfer, SpotCheckResult.Broken], "result");
        store.SpotCheck(bookingId, a.StrOpt("serial"), result, a.StrOpt("detail") ?? "", actor.Name);
        return Ok();
    }

    private DispatchResult BillOvertime(Actor actor, Args a)
    {
        var b = Exists(a.Str("id"));
        var o = a.Model<OvertimeCharge>("overtime");
        if (o.Fee < 0 || o.Fee > 100_000 || o.MinutesOver < 0) throw Bad("The overtime charge is not valid.");
        o.By = actor.Name;
        o.At = Ops.NowIso();
        store.BillOvertime(b.Id, o);
        return Ok();
    }

    private DispatchResult AddDamageFee(Actor actor, Args a)
    {
        var gid = a.Str("guestId");
        if (store.FindGuest(gid) is null) throw Bad("That guest could not be found.");
        var fee = a.Model<DamageFee>("fee");
        if (fee.Amount <= 0 || fee.Amount > 1_000_000) throw Bad("Enter a damage fee amount greater than zero.");
        fee.Item = Clean(fee.Item, 200);
        if (fee.Item.Length == 0) throw Bad("Describe the damaged item.");
        fee.Note = Clean(fee.Note, 500);
        fee.By = actor.Name;
        fee.At = Ops.NowIso();
        fee.Id = store.NewId("DMG");
        fee.Settled = false;
        store.AddDamageFee(gid, fee);
        return Ok();
    }

    private DispatchResult PoolLog(Actor actor, PoolLog log)
    {
        if (log.Ph < 0 || log.Ph > 14) throw Bad("pH must be between 0 and 14.");
        if (log.Chlorine < 0 || log.Chlorine > 20) throw Bad("Chlorine must be between 0 and 20 ppm.");
        log.By = actor.Name;
        log.Id = store.NewId("PL");
        log.At = Ops.NowIso();
        log.Notes = Clean(log.Notes, 500);
        store.AddPoolLog(log);
        return Ok();
    }

    // ------------------------------------------------------------------------------------------ incidents / maintenance

    private DispatchResult AddIncident(Actor actor, Incident i)
    {
        i.Description = Clean(i.Description);
        i.Location = Clean(i.Location, 200);
        i.Type = Clean(i.Type, 100);
        if (i.Description.Length == 0 || i.Type.Length == 0) throw Bad("Describe what happened.");
        if (actor.IsGuest)
        {
            i.GuestId = actor.GuestId;
            i.GuestName = actor.Name;
            i.Source = IncidentSource.Guest;
            if (i.BookingId is not null) Own(actor, i.BookingId);
        }
        i.Status = IncidentStatus.Requested;
        i.Notes = [];
        i.ResolvedAt = null;
        i.AdminReview = null;
        i.GuestConfirmed = false;
        store.AddIncident(i);
        return Ok();
    }

    private static readonly string[] GuestIncidentStatuses = [IncidentStatus.Cancelled, IncidentStatus.InProgress];
    private static readonly string[] GuestMaintStatuses = [MaintenanceStatus.Cancelled, MaintenanceStatus.Requested];

    private DispatchResult UpdateIncident(Actor actor, Args a)
    {
        var id = a.Str("id");
        var item = store.Read(s => s.Incidents.FirstOrDefault(x => x.Id == id)) ?? throw Bad("That report could not be found.");
        var patch = a.Obj("patch");
        if (actor.IsGuest)
        {
            if (item.GuestId != actor.GuestId) throw Bad("That report could not be found.");
            RestrictGuestPatch(patch, GuestIncidentStatuses);
        }
        var by = actor.Name;
        store.UpdateIncident(id, x => Merge(x, patch), a.StrOpt("note"), by, actor.IsGuest ? null : a.StrOpt("notify"));
        return Ok();
    }

    private DispatchResult AddMaint(Actor actor, MaintenanceRequest m)
    {
        m.Concern = Clean(m.Concern, 200);
        m.Area = Clean(m.Area, 200);
        m.Details = Clean(m.Details);
        if (m.Concern.Length == 0 || m.Area.Length == 0) throw Bad("Choose the area and the concern.");
        if (actor.IsGuest)
        {
            m.GuestId = actor.GuestId;
            m.GuestName = actor.Name;
            if (m.BookingId is not null) Own(actor, m.BookingId);
        }
        m.Status = MaintenanceStatus.Requested;
        m.Notes = [];
        m.ResolvedAt = null;
        m.AdminReview = null;
        m.GuestConfirmed = false;
        store.AddMaintenance(m);
        return Ok();
    }

    private DispatchResult UpdateMaint(Actor actor, Args a)
    {
        var id = a.Str("id");
        var item = store.Read(s => s.Maintenance.FirstOrDefault(x => x.Id == id)) ?? throw Bad("That request could not be found.");
        var patch = a.Obj("patch");
        if (actor.IsGuest)
        {
            if (item.GuestId != actor.GuestId) throw Bad("That request could not be found.");
            RestrictGuestPatch(patch, GuestMaintStatuses);
        }
        store.UpdateMaintenance(id, x => Merge(x, patch), a.StrOpt("note"), actor.Name, actor.IsGuest ? null : a.StrOpt("notify"));
        return Ok();
    }

    /// <summary>A guest may only cancel, reopen, or confirm "resolved" on their own report.</summary>
    private static void RestrictGuestPatch(JsonElement patch, string[] allowedStatuses)
    {
        foreach (var p in patch.EnumerateObject())
        {
            if (p.Name == "guestConfirmed") continue;
            if (p.Name == "status" && p.Value.ValueKind == JsonValueKind.String && allowedStatuses.Contains(p.Value.GetString()!)) continue;
            throw Bad("You can only cancel a report or confirm that it is resolved.");
        }
    }

    private static readonly string[] ProtectedFields = ["id", "guestId", "createdAt", "notes", "source"];

    /// <summary>Applies a partial update ({ "status": "resolved" }) onto an existing record.</summary>
    private static void Merge<T>(T target, JsonElement patch) where T : class
    {
        var node = JsonSerializer.SerializeToNode(target, ApiJson.Options)!.AsObject();
        foreach (var p in patch.EnumerateObject())
        {
            if (ProtectedFields.Contains(p.Name, StringComparer.OrdinalIgnoreCase)) continue;
            node[p.Name] = JsonNode.Parse(p.Value.GetRawText());
        }
        var merged = node.Deserialize<T>(ApiJson.Options)!;
        foreach (var prop in typeof(T).GetProperties().Where(x => x.CanWrite && !ProtectedFields.Contains(x.Name, StringComparer.OrdinalIgnoreCase)))
            prop.SetValue(target, prop.GetValue(merged));
    }

    // ------------------------------------------------------------------------------------------ administrator

    private DispatchResult UpdateSlot(Actor actor, Slot slot)
    {
        OneOf(Ops.CanonicalSlotId(slot.Id ?? ""), BookableSlots, "time slot");
        if (slot.Capacity < 0 || slot.Capacity > 10_000) throw Bad("Capacity must be between 0 and 10,000.");
        slot.Label = Clean(slot.Label, 100);
        slot.Time = Clean(slot.Time, 100);
        store.UpdateSlot(slot);
        store.Log($"Updated slot {slot.Label}: capacity {slot.Capacity}, {(slot.Active ? "open" : "closed")}", null, actor.Name);
        return Ok();
    }

    private DispatchResult UpdateCottage(Actor actor, Cottage c)
    {
        if (string.IsNullOrWhiteSpace(c.Id)) throw Bad("Invalid item.");
        CheckId(c.Id, "item id");
        c.Name = Clean(c.Name, 100);
        if (c.Name.Length == 0) throw Bad("Enter a name.");
        if (c.Capacity < 0 || c.Capacity > 1000) throw Bad("Capacity must be between 0 and 1,000.");
        if (c.Price < 0 || c.Price > 1_000_000) throw Bad("Enter a valid price.");
        c.Kind = OneOf(c.Kind, [CottageKind.Cottage, CottageKind.Room, CottageKind.Event], "kind");
        c.Status = OneOf(c.Status, [CottageStatus.Available, CottageStatus.Maintenance], "status");
        if (c.Units is < 1 or > 500) throw Bad("Units must be between 1 and 500.");
        if (c.Image.StartsWith("data:", StringComparison.Ordinal)) CheckImage(c.Image);
        store.UpdateCottage(c);
        store.Log($"Updated {c.Name} ({c.Status})", null, actor.Name);
        return Ok();
    }

    private DispatchResult SavePolicy(Actor actor, Policy p)
    {
        p.Title = Clean(p.Title, 150);
        p.Body = Clean(p.Body, 4000);
        if (p.Title.Length == 0 || p.Body.Length == 0) throw Bad("Enter a title and the policy text.");
        if (string.IsNullOrWhiteSpace(p.Id)) p.Id = store.NewId("pol");
        CheckId(p.Id, "policy id");
        store.SavePolicy(p, actor.Name);
        return Ok();
    }

    private DispatchResult AddBlackout(Actor actor, Args a)
    {
        var date = a.Str("date");
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        var slot = a.StrOpt("slotId");
        if (!string.IsNullOrEmpty(slot)) slot = OneOf(Ops.CanonicalSlotId(slot), BookableSlots, "time slot");
        var kind = a.StrOpt("kind");
        if (!string.IsNullOrEmpty(kind)) OneOf(kind, [BlackoutKind.Closure, BlackoutKind.Maintenance, BlackoutKind.Weather], "closure type");
        var reason = a.Str("reason", 300);
        if (reason.Length == 0) throw Bad("Enter a reason for the closure.");
        store.AddBlackout(date, string.IsNullOrEmpty(slot) ? null : slot, reason, string.IsNullOrEmpty(kind) ? null : kind, actor.Name);
        return Ok();
    }

    private DispatchResult SaveSettings(Actor actor, Args a)
    {
        var s = a.Model<Settings>("settings");
        if (s.DownpaymentPct is < 1 or > 100) throw Bad("Downpayment must be 1 to 100%.");
        if (s.OnlinePaymentMinutes < 1 || s.ConfirmationHours < 1 || s.CancellationHours < 1) throw Bad("Hours and minutes must be greater than zero.");
        if (s.Hold.Regular.CottageHours < 1 || s.Hold.Regular.PoolHours < 1 || s.Hold.Peak.CottageHours < 1 || s.Hold.Peak.PoolHours < 1) throw Bad("Hold times must be greater than zero.");
        store.SaveSettings(s, actor.Name, a.StrOpt("detail"));
        return Ok();
    }

    private DispatchResult SaveTariff(Actor actor, Tariff t)
    {
        if (t.StatutoryDiscountPct is < 0 or > 100) throw Bad("The discount must be between 0 and 100%.");
        foreach (var tier in SessionTier.All)
            foreach (var kind in GuestKind.All)
                if (t.Rates[tier][kind] < 0 || t.Rates[tier][kind] > 100_000) throw Bad("Rates must be zero or more.");
        store.SaveTariff(t, actor.Name);
        return Ok();
    }

    private DispatchResult SaveOps(Actor actor, OpsConfig c)
    {
        if (c.GuestsPerLifeguard < 1 || c.MinLifeguardsPerShift < 1) throw Bad("Enter numbers greater than zero.");
        store.SaveOpsConfig(c, actor.Name);
        return Ok();
    }

    private DispatchResult SaveAddon(Actor actor, Addon d)
    {
        d.Name = Clean(d.Name, 100);
        if (d.Name.Length == 0) throw Bad("Enter a name for the add-on.");
        if (string.IsNullOrWhiteSpace(d.Id)) d.Id = store.NewId("ad");
        CheckId(d.Id, "add-on id");
        if (d.Price < 0 || d.Deposit < 0 || d.DailyCap < 0) throw Bad("Price, deposit and daily limit cannot be negative.");
        store.SaveAddon(d, actor.Name);
        return Ok();
    }

    private DispatchResult AssignShift(Actor actor, Args a)
    {
        var date = a.Str("date");
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        var shift = OneOf(a.Str("shift"), Shift.All, "shift");
        var guard = a.Str("guardId");
        if (store.Read(s => s.Lifeguards.All(l => l.Id != guard))) throw Bad("That lifeguard could not be found.");
        store.AssignShift(date, shift, guard, actor.Name);
        return Ok();
    }

    private DispatchResult BulkNotify(Actor actor, Args a)
    {
        var msg = a.Str("message");
        if (msg.Length == 0) throw Bad("Write a message first.");
        var ids = a.StrList("ids");
        if (ids.Count == 0) throw Bad("Select at least one booking.");
        store.BulkNotify(ids, msg, actor.Name);
        return Ok();
    }

    private DispatchResult Weather(Actor actor, Args a)
    {
        var date = a.Str("date");
        if (!IsDate(date)) throw Bad("Choose a valid date.");
        var mode = OneOf(a.Str("mode"), [WeatherMode.Refund, WeatherMode.Reschedule], "mode");
        var slot = a.StrOpt("slotId");
        var newDate = a.StrOpt("newDate");
        if (mode == WeatherMode.Reschedule && !IsDate(newDate)) throw Bad("Choose the new date.");
        var ids = a.Has("ids") ? a.StrList("ids") : null;
        store.WeatherCancel(date, string.IsNullOrEmpty(slot) ? null : slot, mode, newDate, actor.Name, ids);
        return Ok();
    }

    private DispatchResult DeleteUser(Actor actor, string id)
    {
        var target = store.FindUser(id);
        OpResult result;
        // Staff logins (receptionist/admin) are deleted by the root admin only, through DELETE_STAFF_USER; the root admin is never deletable.
        if (target is not null && target.Role != Roles.Guest && !(id == actor.UserId && actor.IsGuest))
            return DispatchResult.Fail(target.Role == Roles.RootAdmin ? "The root admin account cannot be deleted." : "Only the root admin can delete staff accounts.", 403);
        if (actor.IsAdmin) result = store.DeleteUser(id, actor.Name, actor.UserId);
        else if (id == actor.UserId && actor.IsGuest) result = store.DeleteMyAccountGuarded(id);
        else return DispatchResult.Fail("Your account is not allowed to do that.", 403);
        return result.Ok ? Ok() : DispatchResult.Fail(result.Error ?? "The account could not be deleted.");
    }

    // ------------------------------------------------------------------------------------------ argument reader

    private sealed class Args(JsonElement root)
    {
        public bool Has(string name) => root.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null;

        public string Str(string name, int max = MaxText)
        {
            if (!root.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) throw Bad($"Missing {name}.");
            return Clean(v.GetString(), max);
        }

        public string? StrOpt(string name, int max = 400_000) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? (v.GetString() is { Length: > 0 } s ? (s.Length > max ? s[..max] : s) : null) : null;

        public int Int(string name) =>
            root.TryGetProperty(name, out var v) && v.TryGetInt32(out var n) ? n : throw Bad($"Missing or invalid {name}.");

        public bool Bool(string name) =>
            root.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False ? v.GetBoolean() : throw Bad($"Missing {name}.");

        public JsonElement Obj(string name) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : throw Bad($"Missing {name}.");

        public T Model<T>(string name) where T : class =>
            Obj(name).Deserialize<T>(ApiJson.Options) ?? throw Bad($"Invalid {name}.");

        public List<string> StrList(string name) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array
                ? [.. v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).Take(5000)]
                : throw Bad($"Missing {name}.");
    }
}

internal static class JsonElementExtensions
{
    /// <summary>Reads a required string property.</summary>
    public static string Prop(this JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : "";
}
