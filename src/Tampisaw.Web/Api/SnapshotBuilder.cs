using Tampisaw.Models;

namespace Tampisaw.Api;

/// <summary>A user as the browser sees it: never includes the password hash.</summary>
public sealed class PublicUser
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Role { get; set; } = Roles.Guest;
    public string? GuestId { get; set; }
    public string? Birthdate { get; set; }
    public bool Archived { get; set; }
    public string? CreatedAt { get; set; }
    public string? CreatedBy { get; set; }
}

/// <summary>Same shape as AppState (and the React AppState type) except Users carries no password data.</summary>
public sealed class Snapshot
{
    public List<Policy> Policies { get; set; } = [];
    public List<Booking> Bookings { get; set; } = [];
    public List<Cottage> Cottages { get; set; } = [];
    public List<Slot> Slots { get; set; } = [];
    public List<Guest> Guests { get; set; } = [];
    public DraftBooking Draft { get; set; } = new();
    public List<Hold> Holds { get; set; } = [];
    public List<AuditEvent> AuditLog { get; set; } = [];
    public List<StaffAccount> Staff { get; set; } = [];
    public List<Blackout> Blackouts { get; set; } = [];
    public List<string> ScanHistory { get; set; } = [];
    public List<PublicUser> Users { get; set; } = [];
    public List<Incident> Incidents { get; set; } = [];
    public List<MaintenanceRequest> Maintenance { get; set; } = [];
    public List<Notice> Notices { get; set; } = [];
    public List<Refund> Refunds { get; set; } = [];
    public List<BraceletEvent> BraceletLog { get; set; } = [];
    public Settings Settings { get; set; } = new();
    public Tariff Tariff { get; set; } = new();
    public List<Addon> Addons { get; set; } = [];
    public OpsConfig OpsConfig { get; set; } = new();
    public List<Lifeguard> Lifeguards { get; set; } = [];
    public List<RosterEntry> Roster { get; set; } = [];
    public List<PoolLog> PoolLogs { get; set; } = [];
    public List<WaitlistEntry> Waitlist { get; set; } = [];
    public List<SyncItem> SyncQueue { get; set; } = [];
    public List<ShiftReport> ShiftReports { get; set; } = [];
}

/// <summary>
/// Decides what each role may read. Admin and front-desk staff get the operational data; a guest gets only their own
/// records plus anonymous occupancy (date, session, head count, space) so availability and "full" messages still work;
/// a visitor who is not signed in gets the public catalogue and occupancy only.
/// </summary>
public static class SnapshotBuilder
{
    public static Snapshot Build(AppState s, Actor? actor)
    {
        if (actor is { IsRoot: true }) return Root(s);
        if (actor is { IsStaff: true }) return Staff(s, actor);
        return Guest(s, actor);
    }

    private static PublicUser Pub(User u, bool withPrivate) => new()
    {
        Id = u.Id,
        Name = u.Name,
        Email = u.Email,
        Phone = u.Phone,
        Role = u.Role,
        GuestId = u.GuestId,
        Birthdate = withPrivate ? u.Birthdate : null,
        Archived = u.Archived,
        CreatedAt = u.CreatedAt,
        CreatedBy = u.CreatedBy,
    };

    /// <summary>Account administration (who created, archived or deleted which login, password resets) is for the root admin only.</summary>
    private static bool IsAccountEvent(AuditEvent e) =>
        e.Role == Roles.RootAdmin
        || e.Action.StartsWith("Created receptionist", StringComparison.Ordinal) || e.Action.StartsWith("Created admin", StringComparison.Ordinal)
        || e.Action.StartsWith("Updated account", StringComparison.Ordinal) || e.Action.StartsWith("Archived ", StringComparison.Ordinal)
        || e.Action.StartsWith("Restored ", StringComparison.Ordinal) || e.Action.StartsWith("Deleted ", StringComparison.Ordinal)
        || e.Action.StartsWith("Set a new password", StringComparison.Ordinal) || e.Action.StartsWith("Password reset", StringComparison.Ordinal)
        || e.Action.StartsWith("Root admin", StringComparison.Ordinal) || e.Action.StartsWith("Changed own password", StringComparison.Ordinal);

    /// <summary>The root admin sees only what its two modules need: every login, the full audit log and the basic settings. No bookings, guests or finances.</summary>
    private static Snapshot Root(AppState s) => new()
    {
        AuditLog = s.AuditLog,
        Users = [.. s.Users.Select(u => Pub(u, false))],
        Settings = s.Settings,
    };

    private static Snapshot Staff(AppState s, Actor actor) => new()
    {
        Policies = s.Policies,
        Bookings = s.Bookings,
        Cottages = s.Cottages,
        Slots = s.Slots,
        Guests = s.Guests,
        Holds = s.Holds,
        // The audit log with account changes is the root admin's; admins and the front desk still get the booking and
        // operations history their screens use (booking timelines, rule changes, shift reports).
        AuditLog = [.. s.AuditLog.Where(e => !IsAccountEvent(e))],
        Staff = s.Staff,
        Blackouts = s.Blackouts,
        ScanHistory = s.ScanHistory,
        // Staff logins are managed by the root admin; everyone else only sees guest accounts (and birth dates only for admins).
        Users = [.. s.Users.Where(u => u.Role == Roles.Guest || u.Id == actor.UserId).Select(u => Pub(u, actor.IsAdmin))],
        Incidents = s.Incidents,
        Maintenance = s.Maintenance,
        Notices = s.Notices,
        Refunds = s.Refunds,
        BraceletLog = s.BraceletLog,
        Settings = s.Settings,
        Tariff = s.Tariff,
        Addons = s.Addons,
        OpsConfig = s.OpsConfig,
        Lifeguards = s.Lifeguards,
        Roster = s.Roster,
        PoolLogs = s.PoolLogs,
        Waitlist = s.Waitlist,
        SyncQueue = s.SyncQueue,
        ShiftReports = actor.IsAdmin ? s.ShiftReports : [.. s.ShiftReports.Where(r => r.By == actor.Name)],
    };

    /// <summary>Anonymous stub of someone else's booking: just enough to count capacity, cottages and add-on stock.</summary>
    private static Booking Stub(Booking b) => new()
    {
        Id = b.Id,
        GuestId = "",
        GuestName = "",
        Email = "",
        Date = b.Date,
        SlotId = b.SlotId,
        Guests = b.Guests,
        Type = b.Type,
        CottageId = b.CottageId,
        CottageHours = b.CottageHours,
        EventStart = b.EventStart,
        Status = b.Status,
        Risk = Risk.Low,
        Source = b.Source,
        Addons = [.. b.Addons.Select(a => new BookingAddon { Id = a.Id, Qty = a.Qty })],
    };

    private static Snapshot Guest(AppState s, Actor? actor)
    {
        var gid = actor?.GuestId;
        var mine = !string.IsNullOrEmpty(gid) ? s.Bookings.Where(b => b.GuestId == gid).Select(b => b.Id).ToHashSet() : [];
        return new Snapshot
        {
            Policies = s.Policies,
            Bookings = [.. s.Bookings.Select(b => mine.Contains(b.Id) ? b : Stub(b))],
            Cottages = s.Cottages,
            Slots = s.Slots,
            Guests = [.. s.Guests.Where(g => gid is not null && g.Id == gid)],
            Holds = s.Holds,
            Blackouts = s.Blackouts,
            Users = [.. s.Users.Where(u => actor is not null && u.Id == actor.UserId).Select(u => Pub(u, true))],
            Incidents = [.. s.Incidents.Where(i => gid is not null && i.GuestId == gid)],
            Maintenance = [.. s.Maintenance.Where(m => gid is not null && m.GuestId == gid)],
            Notices = [.. s.Notices.Where(n => n.Audience == NoticeAudience.Guest && gid is not null && (n.GuestId is null || n.GuestId == gid))],
            Refunds = [.. s.Refunds.Where(r => mine.Contains(r.BookingId))],
            Settings = s.Settings,
            Tariff = s.Tariff,
            Addons = s.Addons,
            OpsConfig = s.OpsConfig,
            Waitlist = [.. s.Waitlist.Where(w => gid is not null && w.GuestId == gid)],
        };
    }
}
