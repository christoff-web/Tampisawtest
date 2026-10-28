using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 *  Waitlist (AppStore.Waitlist.cs)
 *  JoinWaitlist(WaitlistEntry)                   WaitlistEntry?     null when the same guest already waits for that date/session/unit
 *  LeaveWaitlist(id)                             void
 *  WaitlistOf(guestId)                           List<WaitlistEntry>
 *  WaitingCount(date, slotId)                    int
 *  Capacity freeing (cancel, reschedule, weather, closure removal...) automatically notifies the first
 *  matching waiting guest; the offer lasts 24 hours, then the next person is told.
 */
public sealed partial class AppStore
{
    public WaitlistEntry? JoinWaitlist(WaitlistEntry entry)
    {
        WaitlistEntry? created = null;
        EditCore(s =>
        {
            var dup = s.Waitlist.Any(w => w.GuestId == entry.GuestId && w.Date == entry.Date && w.SlotId == entry.SlotId
                && w.CottageId == entry.CottageId && w.Status != WaitlistStatus.Expired);
            if (dup) return 0;
            entry.Id = NewId("WL");
            entry.CreatedAt = Ops.NowIso();
            entry.Status = WaitlistStatus.Waiting;
            entry.NotifiedAt = null;
            entry.ExpiresAt = null;
            s.Waitlist = [.. s.Waitlist, entry];
            created = entry;
            return 0;
        }, promote: false);
        return created;
    }

    public void LeaveWaitlist(string id) => Edit(s => s.Waitlist = s.Waitlist.Where(w => w.Id != id).ToList());

    public List<WaitlistEntry> WaitlistOf(string guestId) => Read(s => s.Waitlist.Where(w => w.GuestId == guestId).ToList());

    public int WaitingCount(string date, string slotId) => Read(s => Ops.WaitingCount(s, date, slotId));

    /// <summary>Expire stale offers and tell the first waiting guest whose request now fits. Returns true when anything changed. Caller holds the lock.</summary>
    private bool PromoteWaitlist(AppState s)
    {
        if (s.Waitlist.Count == 0) return false;
        var now = Ops.NowMs();
        var changed = false;
        foreach (var w in s.Waitlist)
        {
            if (w.Status == WaitlistStatus.Notified && w.ExpiresAt is not null && Ops.UnixMs(w.ExpiresAt) <= now)
            {
                w.Status = WaitlistStatus.Expired;
                changed = true;
            }
        }
        var today = Ops.TodayLocal();
        string KeyOf(WaitlistEntry w) => $"{w.Date}|{Ops.CanonicalSlotId(w.SlotId)}|{w.CottageId ?? ""}";
        var notices = new List<Notice>();
        foreach (var w in s.Waitlist.Where(x => x.Status == WaitlistStatus.Waiting && string.CompareOrdinal(x.Date, today) >= 0)
                     .OrderBy(x => x.CreatedAt, StringComparer.Ordinal).ToList())
        {
            // One open offer per session/unit at a time, so we never promise the same space twice.
            if (s.Waitlist.Any(o => o.Status == WaitlistStatus.Notified && KeyOf(o) == KeyOf(w))) continue;
            if (!Ops.EntryFits(s, w)) continue;
            w.Status = WaitlistStatus.Notified;
            w.NotifiedAt = Ops.NowIso();
            w.ExpiresAt = Ops.IsoOffset(Ops.WaitlistHoursToBook);
            notices.Add(MakeNotice(NoticeAudience.Guest,
                $"Good news: space opened up for {w.Guests} guest{(w.Guests == 1 ? "" : "s")} on {w.Date}. Book within {Ops.WaitlistHoursToBook} hours to keep your turn. Spaces are first come, first served. (In-app notice; SMS/email sending is simulated in this prototype.)",
                w.GuestId));
            changed = true;
        }
        if (notices.Count > 0) s.Notices = Prepend(s.Notices, notices);
        return changed;
    }

    /// <summary>Create one in-app reminder per booking that is confirmed for tomorrow. Caller holds the lock.</summary>
    private bool DayBeforeReminders(AppState s)
    {
        var tomorrow = Ops.DateOffset(1);
        var due = s.Bookings
            .Where(b => b.Date == tomorrow && b.Status == BookingStatus.Confirmed && b.DayBeforeReminderAt is null && !string.IsNullOrEmpty(b.GuestId))
            .ToList();
        if (due.Count == 0) return false;
        var stamp = Ops.NowIso();
        foreach (var b in due) b.DayBeforeReminderAt = stamp;
        s.Notices = Prepend(s.Notices, due.Select(b => MakeNotice(NoticeAudience.Guest,
            $"Reminder: your visit ({b.Id}) is tomorrow, {b.Date}. Bring your QR ticket and a valid ID. (In-app reminder; SMS/email sending is simulated in this prototype.)",
            b.GuestId, b.Id)));
        return true;
    }
}
