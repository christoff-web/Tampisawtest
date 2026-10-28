namespace Tampisaw.Models;

public class AppState
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
    public List<User> Users { get; set; } = [];
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
