using System.Globalization;
using System.Text.RegularExpressions;
using Tampisaw.Models;

namespace Tampisaw.Services;

/// <summary>Pure helpers for the staff money pages (shift reconciliation, receipts, arrival text).</summary>
public static partial class Ops
{
    public static readonly int[] ShiftNotes = [1000, 500, 200, 100, 50, 20];

    [GeneratedRegex(@"^Recorded (.+?) (cash|counter) payment")]
    private static partial Regex CashAuditRegex();

    /// <summary>Cash this staff member recorded on the given local day, read from audit entries.</summary>
    public static int CashCollectedBy(IEnumerable<AuditEvent> audit, string actor, DateTime day)
    {
        var total = 0;
        foreach (var e in audit)
        {
            if (e.Actor != actor || ParseIso(e.At).ToLocalTime().Date != day.Date) continue;
            var m = CashAuditRegex().Match(e.Action);
            if (!m.Success) continue;
            var digits = new string(m.Groups[1].Value.Where(c => char.IsDigit(c) || c == '.').ToArray());
            if (double.TryParse(digits, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) total += (int)Math.Round(v);
        }
        return total;
    }

    public static int CashRefundedBy(IEnumerable<Refund> refunds, string actor, DateTime day) =>
        refunds.Where(r => r.Kind == RefundKind.Refund && r.By == actor && ParseIso(r.At).ToLocalTime().Date == day.Date).Sum(r => r.Amount);

    /// <summary>Counted cash from denomination counts ("1000".."20" bills, "coins" in pesos).</summary>
    public static int CountedCash(IReadOnlyDictionary<string, int> counts) =>
        ShiftNotes.Sum(d => d * Math.Max(0, counts.GetValueOrDefault(d.ToString(), 0))) + Math.Max(0, counts.GetValueOrDefault("coins", 0));

    /// <summary>Tone key (ok | warn | bad) and label for a cash variance.</summary>
    public static (string Tone, string Label) VarianceTone(int v) =>
        v == 0 ? ("ok", "Balanced")
        : Math.Abs(v) <= 50 ? ("warn", v > 0 ? "Slightly over" : "Slightly short")
        : ("bad", v > 0 ? "Over" : "Short");

    /// <summary>"Fri, October 16, 2026 at 2:30 PM" for a cash reservation's intended arrival; empty when not set.</summary>
    public static string ArrivalLabel(Booking b)
    {
        if (string.IsNullOrEmpty(b.ArrivalDate)) return "";
        var date = PrettyDateLong(b.ArrivalDate);
        return string.IsNullOrEmpty(b.ArrivalTime) ? date : $"{date} at {b.ArrivalTime}";
    }

    /// <summary>"official" (paid in full), "reserved" (verified part payment) or "none".</summary>
    public static string ReceiptKind(Booking b) =>
        b.Paid > 0 && b.Paid >= b.Total ? "official"
        : b.Paid > 0 && b.PaymentStatus == PaymentStatus.Verified ? "reserved"
        : "none";

    public static string ServiceLabel(Booking b, string? cottageName = null)
    {
        var baseName = b.Type switch { BookingType.Pool => "Pool", BookingType.Cottage => "Cottage", BookingType.Room => "Room", _ => "Event" };
        return string.IsNullOrEmpty(cottageName) ? baseName : $"{baseName} · {cottageName}";
    }

    public static readonly string[] ActiveForMoney =
        [BookingStatus.Pending, BookingStatus.Reserved, BookingStatus.Confirmed, BookingStatus.CheckedIn, BookingStatus.CancellationRequested];

    /// <summary>Change owed for a cash tender; null when the tender is short.</summary>
    public static int? ChangeFor(int due, int tendered) => tendered >= due ? tendered - due : null;
}
