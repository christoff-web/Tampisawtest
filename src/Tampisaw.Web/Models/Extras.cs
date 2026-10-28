namespace Tampisaw.Models;

public static class WaitlistStatus
{
    public const string Waiting = "waiting", Notified = "notified", Expired = "expired";
}

public static class SyncKind
{
    public const string CheckIn = "check-in";
}

/// <summary>A guest waiting for space on a full date/session (optionally for one cottage/room).</summary>
public class WaitlistEntry
{
    public string Id { get; set; } = "";
    public string GuestId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Date { get; set; } = "";
    public string SlotId { get; set; } = "";
    public string? CottageId { get; set; }
    public int Guests { get; set; }
    public string CreatedAt { get; set; } = "";
    /// <summary>WaitlistStatus constant.</summary>
    public string Status { get; set; } = WaitlistStatus.Waiting;
    public string? NotifiedAt { get; set; }
    /// <summary>Notified guests have until this time (24h) to book before the next person is told.</summary>
    public string? ExpiresAt { get; set; }
}

/// <summary>An offline gate action (check-in) queued until the connection is back.</summary>
public class SyncItem
{
    public string Id { get; set; } = "";
    public string BookingId { get; set; } = "";
    public string GuestName { get; set; } = "";
    /// <summary>SyncKind constant.</summary>
    public string Kind { get; set; } = SyncKind.CheckIn;
    public string At { get; set; } = "";
    public string By { get; set; } = "";
    public string? SyncedAt { get; set; }
}

/// <summary>End-of-shift cash count.</summary>
public class ShiftReport
{
    public string Id { get; set; } = "";
    public string ClosedAt { get; set; } = "";
    public string By { get; set; } = "";
    public int OpeningFloat { get; set; }
    public int ExpectedCash { get; set; }
    public int CountedCash { get; set; }
    public int Variance { get; set; }
    /// <summary>Denomination ("1000", "500", ...) to number of bills/coins.</summary>
    public Dictionary<string, int> Denominations { get; set; } = [];
    public string Note { get; set; } = "";
}
