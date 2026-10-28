using System.Globalization;
using System.Text.RegularExpressions;
using Tampisaw.Models;

namespace Tampisaw.Services;

/// <summary>Pure calculations behind the admin Reports, Forecast and Pool log pages (no state, easy to unit test).</summary>
public static partial class Analytics
{
    public static readonly string[] Attended = [BookingStatus.CheckedIn, BookingStatus.CheckedOut, BookingStatus.Completed];
    public static readonly string[] ActiveStatuses = [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed];

    public static string AddDays(string date, int days) => Ops.ToDateString(Ops.DateOf(date).AddDays(days));

    public static bool IsTuesday(string date) => Ops.DateOf(date).DayOfWeek == DayOfWeek.Tuesday;

    /// <summary>"Oct 16"</summary>
    public static string ShortDay(string date) => Ops.DateOf(date).ToString("MMM d", CultureInfo.InvariantCulture);

    /// <summary>"Fri"</summary>
    public static string Weekday(string date) => Ops.DateOf(date).ToString("ddd", CultureInfo.InvariantCulture);

    // ------------------------------------------------------------------ reports

    public sealed record WeekRow(string Label, int Online, int WalkIn);
    public sealed record MethodRow(string Method, int Amount, int Bookings);
    public sealed record ServiceRow(string Name, int Bookings, int Guests, int Revenue);

    public sealed class ReportData
    {
        public string From { get; init; } = "";
        public string To { get; init; } = "";
        public List<Booking> Bookings { get; init; } = [];
        public List<Refund> Refunds { get; init; } = [];
        public int Visitors { get; init; }
        public int Online { get; init; }
        public int WalkIn => Visitors - Online;
        public int NoShows { get; init; }
        public double NoShowRate { get; init; }
        public int Gross { get; init; }
        public int Refunded { get; init; }
        public int DepositsKept { get; init; }
        public int DepositCount { get; init; }
        public int RefundCount { get; init; }
        public int Revenue => Gross - Refunded;
        public int Cancelled { get; init; }
        public List<WeekRow> Weeks { get; init; } = [];
        public List<MethodRow> Methods { get; init; } = [];
        public List<ServiceRow> TopServices { get; init; } = [];
        public List<(string Label, int Count)> Summary { get; init; } = [];
    }

    /// <summary>Null when the range is invalid or nothing falls inside it.</summary>
    public static ReportData? BuildReport(AppState s, string from, string to)
    {
        if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to) || string.CompareOrdinal(from, to) > 0) return null;
        bool InRange(string d) => string.CompareOrdinal(d, from) >= 0 && string.CompareOrdinal(d, to) <= 0;
        var bookings = s.Bookings.Where(b => InRange(b.Date)).ToList();
        var refunds = s.Refunds.Where(r => r.At.Length >= 10 && InRange(r.At[..10])).ToList();
        if (bookings.Count == 0 && refunds.Count == 0) return null;

        var attended = bookings.Where(b => Attended.Contains(b.Status)).ToList();
        var visitors = attended.Sum(b => b.Guests);
        var online = attended.Where(b => b.Source != BookingSource.WalkIn).Sum(b => b.Guests);
        var noShows = bookings.Count(b => b.Status == BookingStatus.NoShow);
        var denom = attended.Count + noShows;
        var counted = bookings.Where(b => b.Status != BookingStatus.Expired).ToList();
        var deposits = refunds.Where(r => r.Kind == RefundKind.DepositKept).ToList();
        var refundRows = refunds.Where(r => r.Kind == RefundKind.Refund).ToList();

        var days = (int)Math.Round((Ops.DateOf(to) - Ops.DateOf(from)).TotalDays) + 1;
        var weeks = new List<WeekRow>();
        for (var i = 0; i < (int)Math.Ceiling(days / 7.0); i++)
        {
            var ws = AddDays(from, i * 7);
            var we = AddDays(from, Math.Min(i * 7 + 6, days - 1));
            var wk = attended.Where(b => string.CompareOrdinal(b.Date, ws) >= 0 && string.CompareOrdinal(b.Date, we) <= 0).ToList();
            weeks.Add(new($"{ShortDay(ws)} - {ShortDay(we)}",
                wk.Where(b => b.Source != BookingSource.WalkIn).Sum(b => b.Guests),
                wk.Where(b => b.Source == BookingSource.WalkIn).Sum(b => b.Guests)));
        }

        var paid = counted.Where(b => b.Paid > 0).ToList();
        var methods = new List<MethodRow>
        {
            new("Cash", paid.Where(b => !IsQr(b)).Sum(b => b.Paid), paid.Count(b => !IsQr(b))),
            new("QR", paid.Where(IsQr).Sum(b => b.Paid), paid.Count(IsQr)),
        };

        var top = counted
            .Where(b => b.Status != BookingStatus.Cancelled)
            .GroupBy(b => ServiceName(s, b))
            .Select(g => new ServiceRow(g.Key, g.Count(), g.Sum(b => b.Guests), g.Sum(b => b.Paid)))
            .OrderByDescending(r => r.Bookings).ThenByDescending(r => r.Revenue).ThenBy(r => r.Name)
            .Take(6).ToList();

        var cancelled = bookings.Count(b => b.Status == BookingStatus.Cancelled);
        return new ReportData
        {
            From = from,
            To = to,
            Bookings = bookings,
            Refunds = refunds,
            Visitors = visitors,
            Online = online,
            NoShows = noShows,
            NoShowRate = denom == 0 ? 0 : noShows * 100.0 / denom,
            Gross = counted.Sum(b => b.Paid),
            Refunded = refundRows.Sum(r => r.Amount),
            DepositsKept = deposits.Sum(r => r.Amount),
            DepositCount = deposits.Count,
            RefundCount = refundRows.Count,
            Cancelled = cancelled,
            Weeks = weeks,
            Methods = methods,
            TopServices = top,
            Summary =
            [
                ("Fully paid bookings", bookings.Count(b => b.Total > 0 && b.Paid >= b.Total)),
                ("Appointments (pool)", bookings.Count(b => b.Type == BookingType.Pool)),
                ("Cottage / room / event", bookings.Count(b => b.Type != BookingType.Pool)),
                ("Day tour", bookings.Count(b => b.SlotId == SlotIds.DayTour)),
                ("Night swimming", bookings.Count(b => b.SlotId == SlotIds.NightSwim)),
                ("Cancelled", cancelled),
                ("Refunds issued", refundRows.Count),
                ("Deposits kept", deposits.Count),
            ],
        };
    }

    /// <summary>Walk-ins and cash reservations are cash; only QR bookings count as QR.</summary>
    public static bool IsQr(Booking b) =>
        b.PaymentMethod == PayMethod.Qr;

    public static string ServiceName(AppState s, Booking b)
    {
        var slot = Ops.SlotLabel(b.SlotId);
        if (b.Type == BookingType.Pool) return $"Pool admission, {slot}";
        var cottage = s.Cottages.FirstOrDefault(c => c.Id == b.CottageId)?.Name;
        var kind = b.Type switch { BookingType.Cottage => "Cottage", BookingType.Room => "Room", _ => "Event" };
        return string.IsNullOrEmpty(cottage) ? $"{kind}, {slot}" : $"{kind}: {cottage}";
    }

    private static string Csv(object? cell) => "\"" + Convert.ToString(cell, CultureInfo.InvariantCulture)?.Replace("\"", "\"\"") + "\"";

    /// <summary>Excel-compatible CSV (with BOM) of the whole report.</summary>
    public static string ToCsv(ReportData d)
    {
        List<object?[]> rows =
        [
            ["Tampisaw report - Golden Pyramid Swimming Pool"],
            ["Period", d.From, d.To],
            [],
            ["KPI", "Value"],
            ["Total visitors", d.Visitors],
            ["Online visitors", d.Online],
            ["Walk-in visitors", d.WalkIn],
            ["Bookings", d.Bookings.Count],
            ["No-shows", d.NoShows],
            ["No-show rate (%)", d.NoShowRate.ToString("0.0", CultureInfo.InvariantCulture)],
            ["Payments collected (PHP)", d.Gross],
            ["Refunds (PHP)", d.Refunded],
            ["Deposits kept (PHP)", d.DepositsKept],
            ["Net revenue (PHP)", d.Revenue],
            [],
            ["Visitors per week", "Online", "Walk-in"],
            .. d.Weeks.Select(w => (object?[])[w.Label, w.Online, w.WalkIn]),
            [],
            ["Revenue by payment method", "Amount (PHP)", "Bookings"],
            .. d.Methods.Select(m => (object?[])[m.Method, m.Amount, m.Bookings]),
            [],
            ["Top services", "Bookings", "Guests", "Collected (PHP)"],
            .. d.TopServices.Select(t => (object?[])[t.Name, t.Bookings, t.Guests, t.Revenue]),
            [],
            ["Booking summary", "Count"],
            .. d.Summary.Select(t => (object?[])[t.Label, t.Count]),
            [],
            ["Refund / deposit ID", "Date", "Booking", "Guest", "Kind", "Amount (PHP)", "Reason", "By"],
            .. d.Refunds.Select(r => (object?[])[r.Id, r.At[..Math.Min(10, r.At.Length)], r.BookingId, r.GuestName, r.Kind, r.Amount, r.Reason, r.By]),
        ];
        return "﻿" + string.Join("\r\n", rows.Select(r => string.Join(",", r.Select(Csv))));
    }

    // ------------------------------------------------------------------ forecast

    public sealed record HistoryDay(string Date, int Visitors, bool Demo);
    public sealed record ForecastDay(string Date, int? Visitors);
    public sealed record AccuracyRow(string Date, int Forecast, int Actual)
    {
        public int Error => Forecast - Actual;
        /// <summary>Absolute error as a share of the actual count.</summary>
        public double ErrorPct => Actual == 0 ? 0 : Math.Abs(Error) * 100.0 / Actual;
    }

    /// <summary>Checked-in guests per open day for the last 30 days (optionally padded with seeded demo counts).</summary>
    public static List<HistoryDay> History(AppState s, string today, bool useDemo)
    {
        var real = new Dictionary<string, int>();
        foreach (var b in s.Bookings.Where(b => Attended.Contains(b.Status)))
            real[b.Date] = real.GetValueOrDefault(b.Date) + b.Guests;
        var list = new List<HistoryDay>();
        for (var i = 30; i >= 1; i--)
        {
            var date = AddDays(today, -i);
            if (IsTuesday(date)) continue;
            if (real.TryGetValue(date, out var v)) list.Add(new(date, v, false));
            else if (useDemo) list.Add(new(date, SeededCount(date), true));
        }
        return list;
    }

    /// <summary>Deterministic pseudo-random demo attendance for a date (busier on weekends).</summary>
    public static int SeededCount(string date)
    {
        unchecked
        {
            var h = 1779033703 ^ date.Length;
            foreach (var ch in date)
            {
                h = (h ^ ch) * -862048943;
                h = (h << 13) | (int)((uint)h >> 19);
            }
            var t = h + 0x6d2b79f5;
            t = (t ^ (int)((uint)t >> 15)) * (t | 1);
            t ^= t + (t ^ (int)((uint)t >> 7)) * (t | 61);
            var rand = ((uint)(t ^ (int)((uint)t >> 14))) / 4294967296.0;
            var dow = Ops.DateOf(date).DayOfWeek;
            var baseCount = dow is DayOfWeek.Sunday or DayOfWeek.Saturday ? 150 : dow == DayOfWeek.Friday ? 105 : 72;
            return Math.Max(20, (int)Math.Round(baseCount + (rand - 0.5) * 44, MidpointRounding.AwayFromZero));
        }
    }

    /// <summary>Simple moving average projection for the next 7 days; Tuesdays (closed) have no value. Each projected day feeds the next.</summary>
    public static List<ForecastDay> Project(IReadOnlyList<int> history, string today, int window, int days = 7)
    {
        var result = new List<ForecastDay>();
        if (history.Count == 0) return result;
        var vals = history.ToList();
        var effective = Math.Max(1, Math.Min(window, history.Count));
        for (var i = 1; i <= days; i++)
        {
            var date = AddDays(today, i);
            if (IsTuesday(date)) { result.Add(new(date, null)); continue; }
            var avg = (int)Math.Round(vals.TakeLast(effective).Average(), MidpointRounding.AwayFromZero);
            vals.Add(avg);
            result.Add(new(date, avg));
        }
        return result;
    }

    /// <summary>Back-test: what the SMA would have said for each past day (using only the days before it) versus what happened.</summary>
    public static List<AccuracyRow> Accuracy(IReadOnlyList<HistoryDay> history, int window)
    {
        var rows = new List<AccuracyRow>();
        for (var i = 1; i < history.Count; i++)
        {
            var prev = history.Skip(Math.Max(0, i - window)).Take(Math.Min(window, i)).Select(h => h.Visitors);
            rows.Add(new(history[i].Date, (int)Math.Round(prev.Average(), MidpointRounding.AwayFromZero), history[i].Visitors));
        }
        return rows;
    }

    /// <summary>100 minus the mean absolute percentage error, clamped to 0..100. Null with no rows.</summary>
    public static double? AccuracyPct(IReadOnlyList<AccuracyRow> rows) =>
        rows.Count == 0 ? null : Math.Clamp(100 - rows.Where(r => r.Actual > 0).DefaultIfEmpty(new("", 0, 1)).Average(r => r.ErrorPct), 0, 100);

    /// <summary>Low under 40 percent of daily capacity, Moderate 40-64 percent, High 65 percent and above.</summary>
    public static string CrowdLevel(int visitors, int dailyCap)
    {
        var pct = visitors / (double)Math.Max(1, dailyCap);
        return pct >= 0.65 ? "High" : pct >= 0.4 ? "Moderate" : "Low";
    }

    // ------------------------------------------------------------------ pool water log

    public const double TempMin = 26, TempMax = 32;

    public static string TempStatus(double celsius) => celsius >= TempMin && celsius <= TempMax ? "ok" : "out-of-range";

    [GeneratedRegex(@"^Water temperature (-?\d+(?:\.\d+)?) °C\.?\s*")]
    private static partial Regex TempRegex();

    /// <summary>The pool log has no temperature column, so the reading is kept as the first words of the notes.</summary>
    public static string EncodeNotes(double? temperature, string notes) =>
        temperature is { } t ? $"Water temperature {t.ToString("0.#", CultureInfo.InvariantCulture)} °C. {notes}".Trim() : notes;

    public static (double? Temperature, string Notes) DecodeNotes(string? notes)
    {
        var text = notes ?? "";
        var m = TempRegex().Match(text);
        return m.Success
            ? (double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture), text[m.Length..].Trim())
            : (null, text);
    }

    // ------------------------------------------------------------------ shifts

    public static (string Label, string Tone) VarianceTone(int v) =>
        v == 0 ? ("Balanced", "success")
        : Math.Abs(v) <= 50 ? (v > 0 ? "Slightly over" : "Slightly short", "warning")
        : (v > 0 ? "Over" : "Short", "danger");
}
