namespace Tampisaw.Models;

// String constants for every status-like field. Model properties stay plain strings
// (kebab-case, exactly as in the React app) so comparisons read the same as the TS code.

public static class Risk
{
    public const string Low = "low", Medium = "medium", High = "high";
    public static readonly string[] All = [Low, Medium, High];
}

public static class PaymentOption
{
    public const string Partial = "partial", Full = "full";
}

public static class BookingStatus
{
    public const string Pending = "pending", Reserved = "reserved", Confirmed = "confirmed",
        CheckedIn = "checked-in", CheckedOut = "checked-out", Completed = "completed",
        CancellationRequested = "cancellation-requested", Cancelled = "cancelled",
        Expired = "expired", NoShow = "no-show";

    public static readonly string[] All =
        [Pending, Reserved, Confirmed, CheckedIn, CheckedOut, Completed, CancellationRequested, Cancelled, Expired, NoShow];

    /// <summary>Statuses that still hold capacity (used by add-on stock).</summary>
    public static readonly string[] Active = [Pending, Reserved, Confirmed, CheckedIn];
}

public static class PaymentStatus
{
    public const string Unpaid = "unpaid", Submitted = "submitted", Verified = "verified", Rejected = "rejected";
}

public static class PayMethod
{
    public const string Cash = "cash", Qr = "qr";
}

public static class BalanceMethod
{
    public const string Cash = "cash", Gcash = "gcash", Online = "online";
}

public static class BalanceProofStatus
{
    public const string Submitted = "submitted", Rejected = "rejected", Approved = "approved";
}

public static class BookingType
{
    public const string Pool = "pool", Cottage = "cottage", Room = "room", Event = "event";
}

public static class BookingSource
{
    public const string Online = "online", WalkIn = "walk-in";
}

public static class Receipt
{
    public const string None = "none", Reserved = "reserved", Official = "official";
}

public static class WalkInOption
{
    public const string AcquireNow = "acquire-now", Reserve = "reserve", Appointment = "appointment";
}

public static class GuestKind
{
    public const string Adult = "adult", Child = "child", Senior = "senior", Pwd = "pwd";
    public static readonly string[] All = [Adult, Child, Senior, Pwd];
}

public static class SessionTier
{
    public const string Day = "day", Night = "night", Overnight = "overnight";
    public static readonly string[] All = [Day, Night, Overnight];
}

public static class SlotIds
{
    public const string DayTour = "day-tour", NightSwim = "night-swim", RoomStay = "room-stay", Event = "event";
}

public static class CottageKind
{
    public const string Cottage = "cottage", Room = "room", Event = "event";
}

public static class CottageStatus
{
    public const string Available = "available", Maintenance = "maintenance";
}

public static class Roles
{
    public const string Guest = "guest", Receptionist = "receptionist", Admin = "admin", RootAdmin = "root-admin";

    /// <summary>Everyone who runs the resort day to day (front desk and admin). The root admin is deliberately NOT here: it only manages staff accounts and reads the audit log.</summary>
    public static readonly string[] Staff = [Receptionist, Admin];

    /// <summary>Roles that may use the administrator tools.</summary>
    public static readonly string[] AdminLevel = [Admin];

    /// <summary>Roles that can be created, edited, archived and deleted from the Root Admin dashboard. Root admins themselves are never managed through the API.</summary>
    public static readonly string[] Managed = [Receptionist, Admin];
}

public static class StaffRole
{
    public const string Admin = "admin", Gate = "gate";
}

public static class Shift
{
    public const string Morning = "morning", Afternoon = "afternoon", Night = "night";
    public static readonly string[] All = [Morning, Afternoon, Night];
}

public static class BraceletKind
{
    public const string Issued = "issued", SpotCheck = "spot-check", Replaced = "replaced",
        Voided = "voided", TimeOut = "time-out", NotReturned = "not-returned";
}

public static class SpotCheckResult
{
    public const string Ok = "ok", WrongService = "wrong-service", Transfer = "transfer", Broken = "broken";
}

public static class IncidentStatus
{
    public const string Requested = "requested", InProgress = "in-progress", Resolved = "resolved", Cancelled = "cancelled";
}

public static class MaintenanceStatus
{
    public const string Requested = "requested", OnTheWay = "on-the-way", Done = "done", Cancelled = "cancelled";
}

public static class NoticeAudience
{
    public const string Guest = "guest", Staff = "staff", Admin = "admin";
}

public static class IncidentSource
{
    public const string Guest = "guest", Staff = "staff", System = "system";
}

public static class RefundKind
{
    public const string Refund = "refund", DepositKept = "deposit-kept";
}

public static class BlackoutKind
{
    public const string Closure = "closure", Maintenance = "maintenance", Weather = "weather";
}

public static class WeatherMode
{
    public const string Refund = "refund", Reschedule = "reschedule";
}
