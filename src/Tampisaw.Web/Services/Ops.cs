using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Tampisaw.Models;

namespace Tampisaw.Services;

public record AdmissionLine(string Kind, int Qty, int Rate, int Gross, int Discount, int Net);

public record Ledger(
    List<AdmissionLine> Lines,
    int Admission,
    int Discount,
    int Cottage,
    int Addons,
    int AddonDeposit,
    int Total);

public record OvertimeCalc(int MinutesOver, double BilledHours, int Fee);

public record UnitAvail(int Total, int Taken, int Left, string? BlockedBy);

public record RiskFactor(string Label, int Points);

public record HealthQuestion(string Id, string Label);

public record RouteRule(string Prefix, string[] Roles);

/// <summary>
/// Pure business rules and formatting helpers (port of lib/ops.ts, lib/rules.ts, lib/search.ts and the
/// availability helpers of the guest page). Dates are "yyyy-MM-dd" strings; timestamps are ISO-8601 UTC strings.
/// </summary>
public static partial class Ops
{
    // ---------------------------------------------------------------- time helpers

    public static string NowIso() => FormatIso(DateTime.UtcNow);

    public static string IsoOffset(double hours) => FormatIso(DateTime.UtcNow.AddHours(hours));

    public static string FormatIso(DateTime utc) =>
        utc.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>Parses an ISO timestamp to UTC.</summary>
    public static DateTime ParseIso(string iso) =>
        DateTimeOffset.Parse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal).UtcDateTime;

    public static long UnixMs(string iso) => new DateTimeOffset(ParseIso(iso)).ToUnixTimeMilliseconds();

    public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Local midnight of a "yyyy-MM-dd" string (Kind = Unspecified, i.e. the server's local time).</summary>
    public static DateTime DateOf(string date) =>
        DateTime.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string ToDateString(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string TodayLocal() => ToDateString(DateTime.Now);

    public static string DateOffset(int days) => ToDateString(DateTime.Now.AddDays(days));

    public static bool IsPastDate(string date) =>
        !string.IsNullOrEmpty(date) && string.CompareOrdinal(date, TodayLocal()) < 0;

    public static string TimeOfDayLocal() => DateTime.Now.ToString("h:mm tt", CultureInfo.InvariantCulture);

    // ---------------------------------------------------------------- formatting

    public static string Peso(double amount)
    {
        var rounded = Math.Round(amount, MidpointRounding.AwayFromZero);
        var text = Math.Abs(rounded).ToString("N0", CultureInfo.InvariantCulture);
        return (rounded < 0 ? "-" : "") + "₱" + text;
    }

    /// <summary>"Fri, Oct 16, 2026"</summary>
    public static string PrettyDate(string date) =>
        DateOf(date).ToString("ddd, MMM d, yyyy", CultureInfo.InvariantCulture);

    /// <summary>"Friday, October 16, 2026" style used by the guest pages ("Fri, October 16, 2026").</summary>
    public static string PrettyDateLong(string date) =>
        DateOf(date).ToString("ddd, MMMM d, yyyy", CultureInfo.InvariantCulture);

    /// <summary>"Oct 16, 3:45 PM" in server-local time.</summary>
    public static string PrettyDateTime(string iso) =>
        ParseIso(iso).ToLocalTime().ToString("MMM d, h:mm tt", CultureInfo.InvariantCulture);

    public static string FormatCountdown(double ms)
    {
        var sign = ms < 0 ? "-" : "";
        var t = (long)Math.Floor(Math.Abs(ms) / 1000);
        return $"{sign}{t / 3600:00}:{t % 3600 / 60:00}:{t % 60:00}";
    }

    public static string Initials(string name) =>
        string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2).Select(p => char.ToUpperInvariant(p[0])));

    /// <summary>Deep copy through JSON; use it to give edit forms a private working copy of a model.</summary>
    public static T Clone<T>(T value) =>
        JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value))!;

    // ---------------------------------------------------------------- pricing

    public static string TierOf(string slotId) =>
        slotId == SlotIds.NightSwim ? SessionTier.Night : slotId == SlotIds.RoomStay ? SessionTier.Overnight : SessionTier.Day;

    public static string TierLabel(string tier) => tier switch
    {
        SessionTier.Day => "Day swimming",
        SessionTier.Night => "Night swimming",
        SessionTier.Overnight => "22-hour / overnight",
        _ => tier,
    };

    public static string KindLabel(string kind) => kind switch
    {
        GuestKind.Adult => "Adult",
        GuestKind.Child => "Child",
        GuestKind.Senior => "Senior citizen",
        GuestKind.Pwd => "PWD",
        _ => kind,
    };

    public static GuestMix EmptyMix() => new();

    public static int MixTotal(GuestMix mix) => mix.Total;

    /// <summary>Senior/PWD get the statutory % off the adult rate for the session tier.</summary>
    public static List<AdmissionLine> AdmissionLines(Tariff tariff, string slotId, GuestMix mix)
    {
        var rates = tariff.Rates[TierOf(slotId)];
        return GuestKind.All
            .Where(kind => mix[kind] > 0)
            .Select(kind =>
            {
                var rate = rates[kind];
                var gross = rate * mix[kind];
                var statutory = kind == GuestKind.Senior || kind == GuestKind.Pwd;
                var discount = statutory
                    ? (int)Math.Round(gross * tariff.StatutoryDiscountPct / 100.0, MidpointRounding.AwayFromZero)
                    : 0;
                return new AdmissionLine(kind, mix[kind], rate, gross, discount, gross - discount);
            })
            .ToList();
    }

    public static int AdmissionTotal(IEnumerable<AdmissionLine> lines) => lines.Sum(l => l.Net);

    public static int AdmissionDiscount(IEnumerable<AdmissionLine> lines) => lines.Sum(l => l.Discount);

    public static int AddonsTotal(IEnumerable<BookingAddon>? addons) => addons?.Sum(a => a.Price * a.Qty) ?? 0;

    public static int AddonDepositTotal(IEnumerable<BookingAddon>? addons) => addons?.Sum(a => a.Deposit * a.Qty) ?? 0;

    /// <summary>One consolidated bill: headcount x session tier, cottage tier, add-ons (deposit is refundable, listed separately).</summary>
    public static Ledger ComputeLedger(Tariff tariff, string slotId, GuestMix mix, int cottagePrice = 0, IEnumerable<BookingAddon>? addons = null)
    {
        var lines = AdmissionLines(tariff, slotId, mix);
        var admission = AdmissionTotal(lines);
        var add = AddonsTotal(addons);
        return new Ledger(lines, admission, AdmissionDiscount(lines), cottagePrice, add, AddonDepositTotal(addons), admission + cottagePrice + add);
    }

    /// <summary>Guest mix of a draft; falls back to the legacy adults/children counts.</summary>
    public static GuestMix MixOfDraft(DraftBooking draft) =>
        draft.Mix ?? new GuestMix { Adult = draft.Adults, Child = draft.Children };

    /// <summary>Ledger for the draft. Room and event bookings do not pay admission; rooms add 250 per guest above 6.</summary>
    public static (Ledger Ledger, int RoomExcess, int Total) LedgerOfDraft(AppState state, DraftBooking draft, Cottage? cottage)
    {
        var admission = draft.Type == BookingType.Pool || draft.Type == BookingType.Cottage;
        var ledger = ComputeLedger(state.Tariff, CanonicalSlotId(draft.SlotId), admission ? MixOfDraft(draft) : EmptyMix(),
            cottage?.Price ?? 0, draft.Addons);
        var roomExcess = draft.Type == BookingType.Room ? Math.Max(0, draft.Guests - 6) * 250 : 0;
        return (ledger, roomExcess, ledger.Total + roomExcess);
    }

    /// <summary>Ledger for a stored booking; null for legacy bookings that were never priced by guest type.</summary>
    public static (Ledger Ledger, int RoomExcess)? LedgerOfBooking(AppState state, Booking b, Cottage? cottage)
    {
        if (b.Mix is null) return null;
        var admission = b.Type == BookingType.Pool || b.Type == BookingType.Cottage;
        var ledger = ComputeLedger(state.Tariff, CanonicalSlotId(b.SlotId), admission ? b.Mix : EmptyMix(), cottage?.Price ?? 0, b.Addons);
        var roomExcess = b.Type == BookingType.Room ? Math.Max(0, b.Guests - 6) * 250 : 0;
        return (ledger, roomExcess);
    }

    /// <summary>Units of an add-on already committed on a date (hard cap, e.g. 5 karaoke per day).</summary>
    public static int AddonTaken(AppState state, string addonId, string date) =>
        state.Bookings
            .Where(b => b.Date == date && BookingStatus.Active.Contains(b.Status))
            .Sum(b => b.Addons.FirstOrDefault(a => a.Id == addonId)?.Qty ?? 0);

    public static int AddonLeft(AppState state, Addon addon, string date) =>
        Math.Max(0, addon.DailyCap - AddonTaken(state, addon.Id, date));

    /// <summary>Overtime: after grace, bill started blocks (default 60 min) at guest + cottage hourly rates.</summary>
    public static OvertimeCalc ComputeOvertime(Tariff tariff, Booking booking, DateTime checkoutAt, DateTime expectedEnd, bool hasCottage)
    {
        var minutesOver = (int)Math.Max(0, Math.Round((checkoutAt - expectedEnd).TotalMinutes, MidpointRounding.AwayFromZero));
        if (minutesOver <= tariff.Overtime.GraceMinutes) return new OvertimeCalc(minutesOver, 0, 0);
        var blocks = (int)Math.Ceiling(minutesOver / (double)tariff.Overtime.BlockMinutes);
        var billedHours = blocks * tariff.Overtime.BlockMinutes / 60.0;
        var tier = TierOf(booking.SlotId);
        var perHour = tariff.Overtime.PerGuestHour[tier] * booking.Guests + (hasCottage ? tariff.Overtime.PerCottageHour[tier] : 0);
        return new OvertimeCalc(minutesOver, billedHours, (int)Math.Round(perHour * billedHours, MidpointRounding.AwayFromZero));
    }

    public static int SessionMinutesFor(string slotId) => slotId switch
    {
        SlotIds.NightSwim => 480,
        SlotIds.RoomStay => 1320,
        SlotIds.Event => 240,
        _ => 480,
    };

    /// <summary>Session timer: remaining ms (negative when overdue); null when not checked in.</summary>
    public static double? SessionRemainingMs(Booking b, long? nowMs = null)
    {
        if (b.CheckedInAtISO is null) return null;
        var end = UnixMs(b.CheckedInAtISO) + (long)(b.SessionMinutes ?? SessionMinutesFor(b.SlotId)) * 60_000;
        return end - (nowMs ?? NowMs());
    }

    // ---------------------------------------------------------------- hashing / QR / waiver

    public static string Sha256Hex(string text) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

    private const string QrSecret = "golden-pyramid-tampisaw-qr-v1";

    /// <summary>QR payload: the full 64-character SHA-256 hex digest of the booking details plus a secret.</summary>
    public static string SignQrToken(Booking b) => SignQrToken(b.Id, b.Date, b.SlotId, b.Guests);

    public static string SignQrToken(string id, string date, string slotId, int guests) =>
        Sha256Hex($"{id}|{date}|{slotId}|{guests}|{QrSecret}");

    /// <summary>Scans every booking for the one this token belongs to.</summary>
    public static Booking? VerifyQrToken(string token, IEnumerable<Booking> bookings)
    {
        var t = (token ?? "").Trim().ToLowerInvariant();
        if (!HexToken().IsMatch(t)) return null;
        foreach (var b in bookings)
        {
            if (b is null) continue;
            if (!string.Equals(SignQrToken(b), t, StringComparison.OrdinalIgnoreCase)) continue;
            if (b.Status is BookingStatus.Cancelled or BookingStatus.Expired or BookingStatus.NoShow or BookingStatus.Completed or BookingStatus.CheckedOut)
                return null;
            if (string.IsNullOrWhiteSpace(b.Id) || string.IsNullOrWhiteSpace(b.Date) || string.IsNullOrWhiteSpace(b.SlotId))
                return null;
            return b;
        }
        return null;
    }

    [GeneratedRegex("^[0-9a-f]{64}$")]
    private static partial Regex HexToken();

    public static readonly string[] WaiverRules =
    [
        "No diving in any pool area.",
        "An adult must actively supervise every child at all times.",
        "Proper swimwear is required in the water.",
    ];

    public static readonly HealthQuestion[] HealthQuestions =
    [
        new("wounds", "Open wounds, cuts, or skin sores"),
        new("contagious", "Communicable or contagious illness (fever, flu, skin infection, eye infection)"),
        new("cardio", "Heart, blood-pressure, or breathing condition (e.g. asthma)"),
        new("pregnant", "Currently pregnant"),
        new("other", "Other health condition we should know about"),
    ];

    public const string WaiverVersion = "GP-WAIVER-2026.1";

    public static Waiver BuildWaiver(IEnumerable<string> rules, Dictionary<string, bool> health, bool dpaConsent, WaiverGuardian? guardian, string bookingRef, string? healthOther = null)
    {
        var other = health.GetValueOrDefault("other") ? (string.IsNullOrWhiteSpace(healthOther) ? null : healthOther.Trim()) : null;
        var acceptedAt = NowIso();
        var ruleList = rules.ToList();
        var body = JsonSerializer.Serialize(new { rules = ruleList, health, healthOther = other, dpaConsent, guardian, bookingRef, acceptedAt, version = WaiverVersion });
        return new Waiver
        {
            AcceptedAt = acceptedAt,
            Version = WaiverVersion,
            Rules = ruleList,
            Health = health,
            HealthOther = other,
            Flagged = health.Values.Any(v => v),
            DpaConsent = dpaConsent,
            Guardian = guardian,
            Hash = Sha256Hex(body),
        };
    }

    // ---------------------------------------------------------------- operations

    /// <summary>Lifeguards required for an expected headcount.</summary>
    public static int GuardsNeeded(int headcount, int perGuard, int min) =>
        Math.Max(min, (int)Math.Ceiling(headcount / (double)Math.Max(1, perGuard)));

    public const double PhMin = 7.2, PhMax = 7.8, ChlorineMin = 1, ChlorineMax = 3;

    /// <summary>"ok" or "out-of-range".</summary>
    public static string PoolLogStatus(double ph, double chlorine) =>
        ph >= PhMin && ph <= PhMax && chlorine >= ChlorineMin && chlorine <= ChlorineMax ? "ok" : "out-of-range";

    public static int DurationCapFor(Tariff tariff, string slotId) =>
        slotId == SlotIds.NightSwim ? tariff.DurationCapHours.NightCottage : tariff.DurationCapHours.DayCottage;

    public static string BraceletColor(string type, string slotId) => type switch
    {
        BookingType.Pool => slotId == SlotIds.NightSwim ? "Indigo (Pool night)" : "Aqua (Pool day)",
        BookingType.Cottage => slotId == SlotIds.NightSwim ? "Orange (Cottage night)" : "Yellow (Cottage day)",
        BookingType.Room => "Green (Room)",
        _ => "Pink (Event)",
    };

    // ---------------------------------------------------------------- access control

    public static readonly RouteRule[] RouteAccess =
    [
        new("/root", [Roles.RootAdmin]),
        new("/admin", [Roles.Admin]),
        new("/staff", [Roles.Admin, Roles.Receptionist]),
    ];

    public static bool CanHandleCash(string? role) => role is Roles.Admin or Roles.Receptionist;

    /// <summary>Longest matching route prefix decides; unlisted paths are open.</summary>
    public static bool CanAccess(string role, string path)
    {
        var p = path.Split('?', '#')[0];
        var rule = RouteAccess
            .OrderByDescending(r => r.Prefix.Length)
            .FirstOrDefault(r => p == r.Prefix || p.StartsWith(r.Prefix + "/", StringComparison.Ordinal));
        return rule is null || rule.Roles.Contains(role);
    }

    public static string RoleLabel(string role) => role switch
    {
        Roles.RootAdmin => "Root Administrator",
        Roles.Admin => "Administrator",
        Roles.Receptionist => "Front desk",
        _ => "Guest",
    };

    /// <summary>Landing route after login for a role.</summary>
    public static string HomeFor(string role) => role switch
    {
        Roles.RootAdmin => "/root",
        Roles.Admin => "/admin",
        Roles.Guest => "/my-bookings",
        _ => "/staff",
    };

    // ---------------------------------------------------------------- scheduling & availability

    private static readonly string[] DeadStatuses = [BookingStatus.Cancelled, BookingStatus.Expired, BookingStatus.NoShow];

    /// <summary>Statuses that free capacity (cancelled, no-show, expired).</summary>
    public static readonly string[] InactiveStatuses = DeadStatuses;

    /// <summary>
    /// Does this booking still occupy its date, session and space? Cancelled, expired and no-show bookings never do,
    /// and neither does a booking whose payment was rejected before anything was paid (the guest has to start over).
    /// </summary>
    public static bool BlocksAvailability(Booking b) =>
        !b.Archived && !DeadStatuses.Contains(b.Status) && !(b.PaymentStatus == PaymentStatus.Rejected && b.Paid <= 0);

    private static readonly Dictionary<string, string> LegacySlots = new()
    {
        ["morning"] = SlotIds.DayTour,
        ["afternoon"] = SlotIds.NightSwim,
        ["evening"] = SlotIds.RoomStay,
    };

    public static string CanonicalSlotId(string id) => LegacySlots.GetValueOrDefault(id, id);

    public static readonly string[] SlotLabelsOrder = [SlotIds.DayTour, SlotIds.NightSwim, SlotIds.RoomStay, SlotIds.Event];

    public static string SlotLabel(string slotId) => CanonicalSlotId(slotId) switch
    {
        SlotIds.DayTour => "Day Tour",
        SlotIds.NightSwim => "Night Swimming",
        SlotIds.RoomStay => "Room Accommodation",
        SlotIds.Event => "Pavilion Event",
        _ => slotId,
    };

    private static readonly Dictionary<string, int> SlotStartHour = new()
    {
        [SlotIds.DayTour] = 8,
        [SlotIds.NightSwim] = 18,
        [SlotIds.RoomStay] = 14,
        [SlotIds.Event] = 8,
        ["morning"] = 8,
        ["afternoon"] = 18,
        ["evening"] = 14,
    };

    /// <summary>Hour of day (0-23) the session starts; defaults to 8.</summary>
    public static int SlotStartHourOf(string slotId) => SlotStartHour.GetValueOrDefault(slotId, 8);

    /// <summary>Local start time of a booking's session.</summary>
    public static DateTime SlotStart(string date, string slotId) => DateOf(date).AddHours(SlotStartHourOf(slotId));

    public static DateTime SlotStart(Booking b) => SlotStart(b.Date, b.SlotId);

    public static double HoursUntil(Booking b) => (SlotStart(b) - DateTime.Now).TotalHours;

    public static int BalanceOf(Booking b) => Math.Max(0, b.Total - b.Paid);

    /// <summary>Pool: full payment. Cottage / room / event: downpayment %.</summary>
    public static int RequiredNow(string type, int total, Settings settings, string? option = null) =>
        type == BookingType.Pool || option == PaymentOption.Full
            ? total
            : (int)Math.Round(total * settings.DownpaymentPct / 100.0, MidpointRounding.AwayFromZero);

    /// <summary>Hold length in hours per Booking Rules (Regular or Peak); shortened to 1h when the visit is within 24h.</summary>
    public static int HoldHoursFor(Settings settings, string type, double hoursAway)
    {
        var set = settings.PeakSeason ? settings.Hold.Peak : settings.Hold.Regular;
        var baseHours = type == BookingType.Pool ? set.PoolHours : set.CottageHours;
        return hoursAway < 24 ? Math.Min(baseHours, 1) : baseHours;
    }

    public static bool IsWithinCutoff(Booking b, Settings settings) => HoursUntil(b) >= settings.CancellationHours;

    /// <summary>True for online bookings made at least ConfirmationHours ahead (they have a confirmation window).</summary>
    public static bool NeedsConfirmation(Booking b, Settings settings)
    {
        if (b.Source == BookingSource.WalkIn || string.IsNullOrEmpty(b.CreatedAt)) return false;
        var lead = (SlotStart(b).ToUniversalTime() - ParseIso(b.CreatedAt)).TotalHours;
        return lead >= settings.ConfirmationHours;
    }

    public static int UnitsOf(Cottage? c) => Math.Max(1, c?.Units ?? 1);

    /// <summary>How many units of a cottage/room/table remain for a date and session. Long tables and the exclusive canteen block each other.</summary>
    public static UnitAvail UnitAvailability(AppState state, Cottage cottage, string date, string slotId,
        string? eventStart = null, string? ignoreBookingId = null, string? holdId = null, string? ownerGuestId = null)
    {
        var now = NowMs();
        bool SameSession(string d, string s) => d == date && (cottage.Kind == CottageKind.Room || CanonicalSlotId(s) == CanonicalSlotId(slotId));
        var live = state.Bookings
            .Where(b => b.Id != ignoreBookingId && BlocksAvailability(b) && SameSession(b.Date, b.SlotId))
            .ToList();
        // A hold only blocks other people: the guest who is checking out never blocks themselves, and a hold on one
        // event block (8-12) does not block another block (1-5) of the same pavilion.
        var holds = state.Holds
            .Where(h => h.Id != holdId && UnixMs(h.ExpiresAt) > now && SameSession(h.Date, h.SlotId)
                && (ownerGuestId is null || h.GuestId != ownerGuestId)
                && (cottage.Kind != CottageKind.Event || h.EventStart is null || h.EventStart == eventStart))
            .ToList();
        int CountFor(string id) =>
            live.Count(b => b.CottageId == id && (cottage.Kind != CottageKind.Event || b.EventStart == eventStart)) +
            holds.Count(h => h.CottageId == id);
        var total = UnitsOf(cottage);
        string? blockedBy = null;
        if (cottage.Id == "c4" && CountFor("c3") > 0)
            blockedBy = "A long table is already reserved for this session, so the exclusive canteen can't be booked.";
        if (cottage.Id == "c3" && CountFor("c4") > 0)
            blockedBy = "The canteen is reserved exclusively for this session.";
        var taken = CountFor(cottage.Id);
        return new UnitAvail(total, taken, blockedBy is not null ? 0 : Math.Max(0, total - taken), blockedBy);
    }

    /// <summary>Default slot definitions; stored slots only override capacity and active flag.</summary>
    public static readonly Slot[] ReservationSlots =
    [
        new() { Id = SlotIds.DayTour, Label = "Day Tour", Time = "8:00 AM – 4:00 PM", Capacity = 120, Active = true },
        new() { Id = SlotIds.NightSwim, Label = "Night Swimming", Time = "6:00 PM – 2:00 AM", Capacity = 100, Active = true },
        new() { Id = SlotIds.RoomStay, Label = "Room Accommodation", Time = "2:00 PM – 11:00 AM next day", Capacity = 36, Active = true },
        new() { Id = SlotIds.Event, Label = "Pavilion Event", Time = "Four-hour event block", Capacity = 150, Active = true },
    ];

    public static Slot? ResolveSlot(IEnumerable<Slot> slots, string slotId)
    {
        var canonical = CanonicalSlotId(slotId);
        var definition = ReservationSlots.FirstOrDefault(s => s.Id == canonical);
        var stored = slots.FirstOrDefault(s => CanonicalSlotId(s.Id) == canonical);
        if (definition is null) return stored;
        return new Slot
        {
            Id = definition.Id,
            Label = definition.Label,
            Time = definition.Time,
            Capacity = stored?.Capacity ?? definition.Capacity,
            Active = stored?.Active ?? definition.Active,
        };
    }

    /// <summary>Upcoming dates that can still be bookable: open days with room left in at least one swim session.</summary>
    public static List<string> AvailableDates(AppState state, int days = 60)
    {
        var result = new List<string>();
        var start = DateTime.Today;
        for (var i = 0; i < days; i++)
        {
            var d = start.AddDays(i);
            var iso = ToDateString(d);
            if (d.DayOfWeek == DayOfWeek.Tuesday) continue;
            if (state.Blackouts.Any(b => b.Date == iso && string.IsNullOrEmpty(b.SlotId))) continue;
            var open = ReservationSlots.Take(2).Any(slot =>
            {
                var def = ResolveSlot(state.Slots, slot.Id) ?? slot;
                if (!def.Active) return false;
                if (state.Blackouts.Any(b => b.Date == iso && !string.IsNullOrEmpty(b.SlotId) && CanonicalSlotId(b.SlotId!) == slot.Id)) return false;
                var used = state.Bookings
                    .Where(b => b.Date == iso && CanonicalSlotId(b.SlotId) == slot.Id && BlocksAvailability(b))
                    .Sum(b => b.Guests);
                return used < def.Capacity;
            });
            if (open) result.Add(iso);
        }
        return result;
    }

    /// <summary>Availability / capacity check. Returns a human message when the slot cannot be booked, otherwise null.</summary>
    public static string? FindConflict(AppState state, DraftBooking draft, string? ignoreBookingId = null, string? holdId = null, string? ownerGuestId = null)
    {
        if (IsPastDate(draft.Date)) return "That date has already passed. Please choose today or a later date.";
        if (DateOf(draft.Date).DayOfWeek == DayOfWeek.Tuesday) return "The resort is closed every Tuesday. Please choose another date.";
        var slot = CanonicalSlotId(draft.SlotId);
        var closure = state.Blackouts.FirstOrDefault(b =>
            b.Date == draft.Date && (string.IsNullOrEmpty(b.SlotId) || CanonicalSlotId(b.SlotId!) == slot));
        if (closure is not null) return $"Closed on this date: {closure.Reason}.";
        var used = state.Bookings
            .Where(b => b.Id != ignoreBookingId && b.Date == draft.Date && CanonicalSlotId(b.SlotId) == slot && BlocksAvailability(b))
            .Sum(b => b.Guests);
        var def = ResolveSlot(state.Slots, slot);
        if (def is not null && used + draft.Guests > def.Capacity)
            return $"{def.Label} is full for this date ({Math.Max(0, def.Capacity - used)} spots left). Please choose another slot.";
        var item = draft.CottageId is null ? null : state.Cottages.FirstOrDefault(c => c.Id == draft.CottageId);
        if (item is not null)
        {
            var avail = UnitAvailability(state, item, draft.Date, slot, draft.EventStart, ignoreBookingId, holdId, ownerGuestId);
            if (avail.Left <= 0)
                return avail.BlockedBy ?? "That cottage / room was just reserved by another guest. Please choose another one.";
        }
        return null;
    }

    /// <summary>The guest's own live booking for the same date and session, if any.</summary>
    public static Booking? FindDuplicate(AppState state, string? guestId, string date, string slotId, string? ignoreBookingId = null)
    {
        if (string.IsNullOrEmpty(guestId)) return null;
        var slot = CanonicalSlotId(slotId);
        string[] ended = [BookingStatus.Cancelled, BookingStatus.NoShow, BookingStatus.Completed, BookingStatus.Expired];
        return state.Bookings.FirstOrDefault(b =>
            b.Id != ignoreBookingId && b.GuestId == guestId && b.Date == date &&
            CanonicalSlotId(b.SlotId) == slot && !ended.Contains(b.Status));
    }

    // ---------------------------------------------------------------- risk

    public static List<RiskFactor> RiskFactors(Booking b, Guest? guest, RiskRules rules, int confirmationHours = 48)
    {
        var list = new List<RiskFactor>();
        if (b.Source == BookingSource.WalkIn) return list;
        if (guest is { NoShows: > 0 })
            list.Add(new($"{guest.NoShows} previous no-show{(guest.NoShows > 1 ? "s" : "")}", rules.PreviousNoShow * guest.NoShows));
        if (guest is { Cancellations: > 0 })
            list.Add(new($"{guest.Cancellations} past cancellation{(guest.Cancellations > 1 ? "s" : "")}", rules.PreviousCancellation * guest.Cancellations));
        if (b.PaymentStatus != PaymentStatus.Verified && b.Paid <= 0)
            list.Add(new("No deposit verified", rules.NoConfirmation));
        else if (!b.AttendanceConfirmed && HoursUntil(b) < confirmationHours)
            list.Add(new("Attendance not confirmed", rules.NoConfirmation));
        if (!string.IsNullOrEmpty(b.CreatedAt))
        {
            var lead = (SlotStart(b).ToUniversalTime() - ParseIso(b.CreatedAt)).TotalHours;
            if (lead < 72) list.Add(new("Booked less than 3 days ahead", rules.LateBooking));
        }
        if (b.Guests >= 10) list.Add(new("Group of 10+", rules.LargeGroup));
        return list;
    }

    public static int RiskScoreOf(Booking b, Guest? guest, RiskRules rules, int confirmationHours = 48) =>
        Math.Min(100, RiskFactors(b, guest, rules, confirmationHours).Sum(f => f.Points));

    public static string RiskLevel(int score, RiskRules rules) =>
        score >= rules.HighFrom ? Risk.High : score >= rules.MediumFrom ? Risk.Medium : Risk.Low;

    // ---------------------------------------------------------------- validation

    public static string LettersOnly(string v) => MultiSpace().Replace(NonLetter().Replace(v ?? "", ""), " ");

    public static string DigitsOnly(string v)
    {
        var digits = new string((v ?? "").Where(char.IsAsciiDigit).ToArray());
        return digits.Length > 11 ? digits[..11] : digits;
    }

    public static bool IsValidEmail(string? v) =>
        !string.IsNullOrWhiteSpace(v) && v.Length <= 254 && ValidEmail().IsMatch(v.Trim());

    public static bool IsValidName(string v) => ValidName().IsMatch((v ?? "").Trim());

    /// <summary>
    /// Philippine mobile number: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (spaces, dashes and brackets are ignored).
    /// Numbers made of one repeated digit (09999999999) are not real subscriber numbers and are refused.
    /// </summary>
    public static bool IsValidPhone(string v) => CanonicalPhone(v) is not null;

    /// <summary>The number in the stored format 09XXXXXXXXX, or null when it is not a valid mobile number.</summary>
    public static string? CanonicalPhone(string? v)
    {
        var raw = (v ?? "").Trim();
        if (raw.Length == 0 || !PhoneChars().IsMatch(raw)) return null;
        var digits = new string(raw.Where(char.IsAsciiDigit).ToArray());
        string local;
        if (digits.StartsWith("63") && digits.Length == 12) local = "0" + digits[2..];
        else if (!raw.StartsWith('+') && digits.Length == 11 && digits.StartsWith("09")) local = digits;
        else return null;
        if (!ValidPhone().IsMatch(local)) return null;
        if (local[2..].Distinct().Count() == 1) return null;
        return local;
    }

    public static int AgeOn(string iso)
    {
        var b = DateOf(iso);
        var t = DateTime.Now;
        var age = t.Year - b.Year;
        if (t.Month < b.Month || (t.Month == b.Month && t.Day < b.Day)) age--;
        return age;
    }

    [GeneratedRegex(@"[^\p{L} ]")]
    private static partial Regex NonLetter();

    [GeneratedRegex(" {2,}")]
    private static partial Regex MultiSpace();

    [GeneratedRegex(@"^\p{L}+( \p{L}+)*$")]
    private static partial Regex ValidName();

    [GeneratedRegex(@"^09\d{9}$")]
    private static partial Regex ValidPhone();

    [GeneratedRegex(@"^\+?[0-9 ()\-]+$")]
    private static partial Regex PhoneChars();

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")]
    private static partial Regex ValidEmail();

    // ---------------------------------------------------------------- search

    /// <summary>Digits only; +63 / 63 prefix is treated as a leading 0 (Philippine mobile).</summary>
    public static string NormalizePhone(string value)
    {
        var digits = new string((value ?? "").Where(char.IsAsciiDigit).ToArray());
        if (digits.StartsWith("63", StringComparison.Ordinal) && digits.Length >= 11) digits = "0" + digits[2..];
        return digits;
    }

    public const string SearchPlaceholder = "Search name, email or mobile";

    /// <summary>One query is checked against name, email, mobile and booking id at once. Phone matching needs 3+ digits.</summary>
    public static bool MatchesGuest(string? query, string? name = null, string? email = null, string? phone = null, string? id = null, IEnumerable<string?>? extra = null)
    {
        var q = (query ?? "").Trim().ToLowerInvariant();
        if (q.Length == 0) return true;
        var fields = new[] { name, email, id }.Concat(extra ?? []);
        if (fields.Any(v => !string.IsNullOrEmpty(v) && v.ToLowerInvariant().Contains(q, StringComparison.Ordinal))) return true;
        var qd = NormalizePhone(q);
        return qd.Length >= 3 && !string.IsNullOrEmpty(phone) && NormalizePhone(phone).Contains(qd, StringComparison.Ordinal);
    }

    public const string PaymentQrSrc = "/payment-qr.png";
}
