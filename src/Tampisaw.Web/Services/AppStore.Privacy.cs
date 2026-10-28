using Tampisaw.Data;
using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 *  Account erasure and misc (AppStore.Privacy.cs)
 *  DeleteUser(userId, by?, actingUserId?)        OpResult           admin removes an account (guards: not self, not the last admin)
 *  DeleteMyAccount(userId)                       OpResult           self-service erasure (guard: not the last admin)
 *  BulkNotify(ids, message, by)                  int                one guest notice per booking id; returns how many were sent
 *  QueueSync(SyncItem) / PendingSync() / MarkSynced(ids?)           offline gate queue
 *  SaveShift(ShiftReport) / ShiftReportsBy(by)   cash-count shift reports
 */
public record OpResult(bool Ok, string? Error = null)
{
    public static readonly OpResult Success = new(true);
    public static OpResult Fail(string error) => new(false, error);
}

public sealed partial class AppStore
{
    public const string DeletedGuestName = "Deleted guest";

    public OpResult DeleteMyAccount(string userId) => DeleteUser(userId, by: null, actingUserId: userId, selfService: true);

    /// <summary>
    /// Removes the user, their guest profile, unpaid bookings (with their notices/bracelet log), draft, waitlist and notices.
    /// Paid bookings are kept for financial reports but anonymised; upcoming paid ones are cancelled.
    /// The audit entry carries the account name only.
    /// </summary>
    public OpResult DeleteUser(string userId, string? by = null, string? actingUserId = null) =>
        DeleteUser(userId, by, actingUserId, selfService: false);

    private OpResult DeleteUser(string userId, string? by, string? actingUserId, bool selfService)
    {
        OpResult result = OpResult.Fail("Account not found.");
        EditCore(s =>
        {
            var target = s.Users.FirstOrDefault(u => u.Id == userId);
            if (target is null) return 0;
            if (!selfService && actingUserId is not null && actingUserId == target.Id)
            {
                result = OpResult.Fail("You cannot delete your own account from the admin panel.");
                return 0;
            }
            if (target.Role == Roles.RootAdmin)
            {
                result = OpResult.Fail("The root admin account cannot be deleted.");
                return 0;
            }
            if (target.Role == Roles.Admin && s.Users.Count(u => u.Role is Roles.Admin or Roles.RootAdmin) <= 1)
            {
                result = OpResult.Fail("The last admin account cannot be deleted.");
                return 0;
            }
            var gid = string.IsNullOrEmpty(target.GuestId) ? null : target.GuestId;
            bool Mine(Booking b) => gid is not null && b.GuestId == gid;
            string[] open = [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed, BookingStatus.CancellationRequested];

            var removed = s.Bookings.Where(b => Mine(b) && b.Paid <= 0).Select(b => b.Id).ToHashSet();
            var kept = s.Bookings.Where(b => Mine(b) && b.Paid > 0).Select(b => b.Id).ToHashSet();
            var email = target.Email.ToLowerInvariant();

            foreach (var b in s.Bookings.Where(b => kept.Contains(b.Id)))
            {
                var wasOpen = open.Contains(b.Status);
                b.GuestId = "";
                b.GuestName = DeletedGuestName;
                b.Email = "";
                b.Phone = null;
                b.ProofName = null;
                b.ProofImage = null;
                if (b.BalanceProof is not null) b.BalanceProof.Image = null;
                if (b.Waiver is not null)
                {
                    b.Waiver.Guardian = null;
                    b.Waiver.HealthOther = null;
                }
                if (wasOpen)
                {
                    b.Status = BookingStatus.Cancelled;
                    b.CancelReason = "Account deleted";
                }
            }

            foreach (var r in s.Refunds.Where(r => kept.Contains(r.BookingId))) r.GuestName = DeletedGuestName;
            foreach (var i in s.Incidents.Where(i => gid is not null && i.GuestId == gid))
            {
                i.GuestId = null;
                i.GuestName = DeletedGuestName;
            }
            foreach (var m in s.Maintenance.Where(m => gid is not null && m.GuestId == gid))
            {
                m.GuestId = null;
                m.GuestName = DeletedGuestName;
            }
            foreach (var a in s.AuditLog.Where(a => a.Actor == target.Name && a.BookingId is not null && kept.Contains(a.BookingId)))
                a.Actor = DeletedGuestName;

            s.Users = s.Users.Where(u => u.Id != target.Id).ToList();
            s.Guests = s.Guests.Where(g => g.Id != gid).ToList();
            s.Bookings = s.Bookings.Where(b => !removed.Contains(b.Id)).ToList();
            if (s.Draft.Email.Equals(email, StringComparison.OrdinalIgnoreCase)) s.Draft = Seed.NewDraft();
            s.Waitlist = s.Waitlist.Where(w => gid is null || w.GuestId != gid).ToList();
            s.Notices = s.Notices.Where(n => !(gid is not null && n.GuestId == gid) && !(n.BookingId is not null && removed.Contains(n.BookingId))).ToList();
            s.BraceletLog = s.BraceletLog.Where(e => !(e.BookingId is not null && removed.Contains(e.BookingId))).ToList();
            s.ScanHistory = s.ScanHistory.Where(line => !removed.Any(id => line.Contains(id, StringComparison.Ordinal))).ToList();
            s.SyncQueue = s.SyncQueue.Where(q => !removed.Contains(q.BookingId)).ToList();
            s.AuditLog = Prepend(
                s.AuditLog.Where(e => !(e.BookingId is not null && removed.Contains(e.BookingId))).ToList(),
                Audit($"Deleted {target.Role} account: {target.Name}", null, selfService ? target.Name : by ?? "Admin"));
            result = OpResult.Success;
            return 0;
        });
        return result;
    }

    public int BulkNotify(IEnumerable<string> ids, string message, string by) => EditCore(s =>
    {
        var set = ids.ToHashSet();
        var targets = s.Bookings.Where(b => set.Contains(b.Id) && !string.IsNullOrEmpty(b.GuestId)).ToList();
        if (targets.Count == 0) return 0;
        s.Notices = Prepend(s.Notices, targets.Select(t => MakeNotice(NoticeAudience.Guest, message, t.GuestId, t.Id)));
        Push(s, Audit($"Sent message to {targets.Count} guest(s)", null, by));
        return targets.Count;
    });

    // ------------------------------------------------------------ offline sync queue

    public SyncItem QueueSync(SyncItem item) => EditCore(s =>
    {
        if (string.IsNullOrEmpty(item.Id)) item.Id = NewId("SYNC");
        if (string.IsNullOrEmpty(item.At)) item.At = Ops.NowIso();
        item.SyncedAt = null;
        s.SyncQueue = Prepend(s.SyncQueue, item);
        return item;
    }, promote: false);

    public List<SyncItem> PendingSync() => Read(s => s.SyncQueue.Where(q => q.SyncedAt is null).ToList());

    /// <summary>Marks queued items as synced (all pending ones when ids is null) and audits each. Returns how many were synced.</summary>
    public int MarkSynced(IEnumerable<string>? ids = null) => EditCore(s =>
    {
        var set = ids?.ToHashSet();
        var pending = s.SyncQueue.Where(q => q.SyncedAt is null && (set is null || set.Contains(q.Id))).ToList();
        if (pending.Count == 0) return 0;
        var at = Ops.NowIso();
        foreach (var q in pending) q.SyncedAt = at;
        s.AuditLog = Prepend(s.AuditLog, pending.Select(q =>
            Audit($"Offline check-in synced (done {Ops.ParseIso(q.At).ToLocalTime():h:mm tt})", q.BookingId, q.By)));
        return pending.Count;
    }, promote: false);

    // ------------------------------------------------------------ shift reports

    public ShiftReport SaveShift(ShiftReport report) => EditCore(s =>
    {
        if (string.IsNullOrEmpty(report.Id)) report.Id = NewId("SHIFT");
        if (string.IsNullOrEmpty(report.ClosedAt)) report.ClosedAt = Ops.NowIso();
        s.ShiftReports = Prepend(s.ShiftReports, report);
        Push(s, Audit($"Closed shift: counted {Ops.Peso(report.CountedCash)}, variance {Ops.Peso(report.Variance)}", null, report.By));
        return report;
    }, promote: false);

    public List<ShiftReport> ShiftReportsBy(string by) =>
        Read(s => s.ShiftReports.Where(r => r.By.Equals(by, StringComparison.OrdinalIgnoreCase)).ToList());
}
