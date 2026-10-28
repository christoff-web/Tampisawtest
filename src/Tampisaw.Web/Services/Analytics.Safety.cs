using Tampisaw.Models;

namespace Tampisaw.Services;

/// <summary>Pure lifeguard-roster, crowd and live-alert logic for the admin safety pages.</summary>
public static partial class Analytics
{
    public sealed record CrowdForecast(int Day, int Night, int BookedDay, int BookedNight, string Method);

    public sealed record ShiftInfo(string Id, string Label, string Hours);

    public static readonly ShiftInfo[] Shifts =
    [
        new(Shift.Morning, "Morning", "6:00 AM - 12:00 PM"),
        new(Shift.Afternoon, "Afternoon", "12:00 - 6:00 PM"),
        new(Shift.Night, "Night", "6:00 PM - 12:00 AM"),
    ];

    /// <summary>Shift covering a clock time.</summary>
    public static string ShiftAt(DateTime now) => now.Hour switch { >= 6 and < 12 => Shift.Morning, >= 12 and < 18 => Shift.Afternoon, _ => Shift.Night };

    private static bool IsNight(string slotId) => slotId == SlotIds.NightSwim;

    /// <summary>Expected crowd per day/night: SMA of up to 7 recent non-empty days (needs 3), falling back to the overall mean, then raised to the confirmed headcount.</summary>
    public static CrowdForecast ExpectedCrowd(AppState s, string date)
    {
        int Actual(string d, bool night) => s.Bookings.Where(b => b.Date == d && Attended.Contains(b.Status) && IsNight(b.SlotId) == night).Sum(b => b.Guests);
        int? Sma(bool night)
        {
            var vals = new List<int>();
            for (var i = 1; i <= 14 && vals.Count < 7; i++)
            {
                var v = Actual(AddDays(date, -i), night);
                if (v > 0) vals.Add(v);
            }
            return vals.Count >= 3 ? (int)Math.Round(vals.Average(), MidpointRounding.AwayFromZero) : null;
        }
        var perDay = s.Bookings.Where(b => Attended.Contains(b.Status)).GroupBy(b => b.Date).Select(g => g.Sum(b => b.Guests)).ToList();
        var fallback = perDay.Count == 0 ? 60 : (int)Math.Round(perDay.Average(), MidpointRounding.AwayFromZero);
        var dayS = Sma(false); var nightS = Sma(true);
        int Booked(bool night) => s.Bookings.Where(b => b.Date == date && (ActiveStatuses.Contains(b.Status) || Attended.Contains(b.Status)) && IsNight(b.SlotId) == night).Sum(b => b.Guests);
        var bd = Booked(false); var bn = Booked(true);
        var day = Math.Max(dayS ?? fallback, bd);
        var night2 = Math.Max(nightS ?? (int)Math.Round(fallback * 0.6, MidpointRounding.AwayFromZero), bn);
        return new(day, night2, bd, bn, dayS is null && nightS is null ? "overall average attendance" : "7-day moving average");
    }

    public sealed record SafetyAlert(string Kind, string Tone, string Title, string Detail);

    /// <summary>Live ratio, bracelet-overtime and capacity alerts for today.</summary>
    public static List<SafetyAlert> LiveAlerts(AppState s, DateTime now)
    {
        var alerts = new List<SafetyAlert>();
        var today = Ops.ToDateString(now);
        var inPool = s.Bookings.Where(b => b.Date == today && b.Status == BookingStatus.CheckedIn).ToList();

        var headcount = inPool.Sum(b => b.Guests);
        var shift = ShiftAt(now);
        var onDuty = s.Roster.Count(r => r.Date == today && r.Shift == shift && s.Lifeguards.Any(g => g.Id == r.GuardId && g.Active));
        var needed = Ops.GuardsNeeded(headcount, s.OpsConfig.GuestsPerLifeguard, s.OpsConfig.MinLifeguardsPerShift);
        if (headcount > 0 && onDuty < needed)
            alerts.Add(new("ratio", "danger", "Lifeguard ratio breached",
                $"{headcount} guests in the pool need {needed} lifeguards (1 per {s.OpsConfig.GuestsPerLifeguard}); only {onDuty} rostered on the {shift} shift."));
        else if (headcount > 0 && onDuty == needed)
            alerts.Add(new("ratio", "warning", "At the lifeguard limit",
                $"{headcount} guests in the pool with {onDuty} lifeguard{(onDuty == 1 ? "" : "s")} on duty. One more guest group may breach the ratio."));

        foreach (var b in inPool)
        {
            var rem = Ops.SessionRemainingMs(b);
            if (rem is < 0)
            {
                var mins = (int)Math.Ceiling(-rem.Value / 60000);
                alerts.Add(new("overtime", mins >= 30 ? "danger" : "warning", $"{b.GuestName} is over time ({b.Id})",
                    $"Bracelet session ended {mins} min ago. {b.Guests} guest{(b.Guests == 1 ? "" : "s")} still checked in; overtime applies at time-out."));
            }
        }

        foreach (var slot in s.Slots.Where(x => x.Active && x.Capacity > 0))
        {
            var used = s.Bookings.Where(b => b.Date == today && b.SlotId == slot.Id && (ActiveStatuses.Contains(b.Status) || b.Status == BookingStatus.CheckedIn)).Sum(b => b.Guests);
            var pct = used * 100.0 / slot.Capacity;
            if (pct >= 100) alerts.Add(new("capacity", "danger", $"{slot.Label} is full", $"{used} of {slot.Capacity} guests booked today."));
            else if (pct >= 85) alerts.Add(new("capacity", "warning", $"{slot.Label} is nearly full", $"{used} of {slot.Capacity} guests booked today ({pct:0}%)."));
        }
        return alerts;
    }
}
