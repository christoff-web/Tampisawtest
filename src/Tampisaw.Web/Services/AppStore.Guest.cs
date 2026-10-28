using System.Text.Json;
using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 *  Guest account helpers (AppStore.Guest.cs)
 *  UpdateProfile(userId, name, phone, birthdate)    OpResult  name letters only, phone required (09XXXXXXXXX), 18+ when a birthdate is set
 *  UpcomingPaidBookings(state, guestId)              static    open bookings with money paid and a date today or later
 *  DeleteMyAccountGuarded(userId)                    OpResult  refuses while upcoming paid bookings exist, else DeleteMyAccount
 *  ExportMyData(userId)                              string    JSON of the guest's own records (no password hash)
 *  SubmitFeedback(userId, rating, message)           OpResult  staff notice carrying the guest's feedback
 */
public sealed partial class AppStore
{
    private static readonly string[] UpcomingStatuses =
        [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed, BookingStatus.CancellationRequested];

    public static List<Booking> UpcomingPaidBookings(AppState s, string? guestId, string? today = null)
    {
        if (string.IsNullOrEmpty(guestId)) return [];
        var t = today ?? Ops.TodayLocal();
        return s.Bookings
            .Where(b => b.GuestId == guestId && b.Paid > 0 && UpcomingStatuses.Contains(b.Status) && string.CompareOrdinal(b.Date, t) >= 0)
            .ToList();
    }

    public OpResult UpdateProfile(string userId, string name, string phone, string? birthdate)
    {
        var cleanName = (name ?? "").Trim();
        if (cleanName.Length == 0 || !Ops.IsValidName(cleanName)) return OpResult.Fail("Enter your full name using letters only.");
        var cleanPhone = (phone ?? "").Trim();
        if (cleanPhone.Length == 0) return OpResult.Fail("Mobile number is required.");
        if (!Ops.IsValidPhone(cleanPhone)) return OpResult.Fail("Mobile number must be 11 digits, numbers only (09XXXXXXXXX).");
        if (!string.IsNullOrEmpty(birthdate))
        {
            if (string.CompareOrdinal(birthdate, Ops.TodayLocal()) > 0) return OpResult.Fail("Date of birth cannot be in the future.");
            if (Ops.AgeOn(birthdate) < 18) return OpResult.Fail("You must be 18 or older to hold an account.");
        }
        OpResult result = OpResult.Fail("Account not found.");
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == userId);
            if (u is null) return 0;
            u.Name = cleanName;
            u.Phone = cleanPhone;
            u.Birthdate = string.IsNullOrEmpty(birthdate) ? null : birthdate;
            var g = s.Guests.FirstOrDefault(x => x.Id == u.GuestId);
            if (g is not null)
            {
                g.Name = cleanName;
                g.Phone = cleanPhone;
            }
            Push(s, Audit("Updated own profile", null, cleanName));
            result = OpResult.Success;
            return 0;
        });
        return result;
    }

    public OpResult DeleteMyAccountGuarded(string userId)
    {
        var user = FindUser(userId);
        if (user is null) return OpResult.Fail("Account not found.");
        var upcoming = Read(s => UpcomingPaidBookings(s, user.GuestId));
        if (upcoming.Count > 0)
            return OpResult.Fail($"You still have {upcoming.Count} upcoming paid {(upcoming.Count == 1 ? "booking" : "bookings")}. Cancel and settle {(upcoming.Count == 1 ? "it" : "them")} with the resort first, then delete your account.");
        return DeleteMyAccount(userId);
    }

    public string ExportMyData(string userId) => Read(s =>
    {
        var u = s.Users.FirstOrDefault(x => x.Id == userId);
        if (u is null) return "{}";
        var gid = u.GuestId;
        var bookings = s.Bookings.Where(b => !string.IsNullOrEmpty(gid) && b.GuestId == gid).ToList();
        var ids = bookings.Select(b => b.Id).ToHashSet();
        var data = new
        {
            exportedAt = Ops.NowIso(),
            note = "This file holds the records Tampisaw keeps about your account. Your password is stored only as a salted hash and is not included.",
            user = new { u.Id, u.Name, u.Email, u.Phone, u.Role, u.GuestId, u.Birthdate },
            guestRecord = s.Guests.FirstOrDefault(g => g.Id == gid),
            bookings,
            waivers = bookings.Where(b => b.Waiver is not null).Select(b => new { bookingId = b.Id, b.Waiver }).ToList(),
            notifications = s.Notices.Where(n => n.Audience == NoticeAudience.Guest && (n.GuestId == gid || (n.BookingId is not null && ids.Contains(n.BookingId)))).ToList(),
            waitlist = s.Waitlist.Where(w => !string.IsNullOrEmpty(gid) && w.GuestId == gid).ToList(),
            refunds = s.Refunds.Where(r => ids.Contains(r.BookingId)).ToList(),
            incidents = s.Incidents.Where(i => !string.IsNullOrEmpty(gid) && i.GuestId == gid).ToList(),
            maintenanceRequests = s.Maintenance.Where(m => !string.IsNullOrEmpty(gid) && m.GuestId == gid).ToList(),
        };
        return JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
    });

    public OpResult SubmitFeedback(string userId, int rating, string message)
    {
        var u = FindUser(userId);
        if (u is null) return OpResult.Fail("Please log in to send feedback.");
        var text = (message ?? "").Trim();
        if (text.Length == 0) return OpResult.Fail("Write a short message before sending.");
        if (rating is < 1 or > 5) return OpResult.Fail("Choose a rating from 1 to 5.");
        Edit(s => Push(s, MakeNotice(NoticeAudience.Staff, $"Feedback from {u.Name} ({rating}/5): {text}")));
        return OpResult.Success;
    }
}
