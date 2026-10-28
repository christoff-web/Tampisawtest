using Tampisaw.Models;

namespace Tampisaw.Services;

/// <summary>Waitlist capacity helpers (port of lib/waitlist.ts, the pure read-only half).</summary>
public static partial class Ops
{
    public const int WaitlistHoursToBook = 24;

    private static readonly Dictionary<string, int> DefaultSlotCapacity = new()
    {
        [SlotIds.DayTour] = 120,
        [SlotIds.NightSwim] = 100,
        [SlotIds.RoomStay] = 36,
        [SlotIds.Event] = 150,
    };

    /// <summary>Guests already booked in a session (cancelled, expired and no-show bookings do not count).</summary>
    public static int SlotUsed(AppState state, string date, string slotId) =>
        state.Bookings
            .Where(b => b.Date == date && CanonicalSlotId(b.SlotId) == CanonicalSlotId(slotId) && !DeadStatuses.Contains(b.Status))
            .Sum(b => b.Guests);

    public static int SlotCapacity(AppState state, string slotId)
    {
        var canon = CanonicalSlotId(slotId);
        return state.Slots.FirstOrDefault(s => CanonicalSlotId(s.Id) == canon)?.Capacity ?? DefaultSlotCapacity.GetValueOrDefault(canon, 0);
    }

    /// <summary>Whether this wish could be booked right now.</summary>
    public static bool EntryFits(AppState state, string date, string slotId, string? cottageId, int guests)
    {
        var closed = state.Blackouts.Any(b => b.Date == date && (string.IsNullOrEmpty(b.SlotId) || CanonicalSlotId(b.SlotId) == CanonicalSlotId(slotId)));
        if (closed) return false;
        if (SlotUsed(state, date, slotId) + guests > SlotCapacity(state, slotId)) return false;
        if (!string.IsNullOrEmpty(cottageId))
        {
            var item = state.Cottages.FirstOrDefault(c => c.Id == cottageId);
            if (item is null || item.Status != CottageStatus.Available) return false;
            if (UnitAvailability(state, item, date, slotId).Left <= 0) return false;
        }
        return true;
    }

    public static bool EntryFits(AppState state, WaitlistEntry e) => EntryFits(state, e.Date, e.SlotId, e.CottageId, e.Guests);

    /// <summary>Number of people waiting for a date/session (all rooms and cottages).</summary>
    public static int WaitingCount(AppState state, string date, string slotId) =>
        state.Waitlist.Count(w => w.Status != WaitlistStatus.Expired && w.Date == date && CanonicalSlotId(w.SlotId) == CanonicalSlotId(slotId));
}
