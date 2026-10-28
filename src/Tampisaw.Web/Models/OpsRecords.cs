namespace Tampisaw.Models;

public class PoolLog
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public double Ph { get; set; }
    public double Chlorine { get; set; }
    public bool Backwash { get; set; }
    public bool Cleaned { get; set; }
    public string Notes { get; set; } = "";
    public string By { get; set; } = "";
}

public class BraceletEvent
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public string? BookingId { get; set; }
    /// <summary>BraceletKind constant.</summary>
    public string Kind { get; set; } = BraceletKind.Issued;
    public string Detail { get; set; } = "";
    public string By { get; set; } = "";
}

public class Note
{
    public string At { get; set; } = "";
    public string By { get; set; } = "";
    public string Text { get; set; } = "";
}

public class Incident
{
    /// <summary>Assigned by the store (INC-1001...).</summary>
    public string Id { get; set; } = "";
    public string? GuestId { get; set; }
    public string GuestName { get; set; } = "";
    public string? BookingId { get; set; }
    public string Type { get; set; } = "";
    public string Location { get; set; } = "";
    public string Description { get; set; } = "";
    /// <summary>IncidentStatus constant.</summary>
    public string Status { get; set; } = IncidentStatus.Requested;
    public bool Serious { get; set; }
    public bool Escalated { get; set; }
    public bool GuestConfirmed { get; set; }
    public string? AdminReview { get; set; }
    /// <summary>IncidentSource constant.</summary>
    public string Source { get; set; } = IncidentSource.Guest;
    /// <summary>Filled by the store when empty.</summary>
    public string CreatedAt { get; set; } = "";
    public string? ResolvedAt { get; set; }
    public List<Note> Notes { get; set; } = [];
}

public class MaintenanceRequest
{
    /// <summary>Assigned by the store (MNT-2001...).</summary>
    public string Id { get; set; } = "";
    public string? GuestId { get; set; }
    public string GuestName { get; set; } = "";
    public string? BookingId { get; set; }
    public string Area { get; set; } = "";
    public string Concern { get; set; } = "";
    public string Details { get; set; } = "";
    public bool Urgent { get; set; }
    /// <summary>MaintenanceStatus constant.</summary>
    public string Status { get; set; } = MaintenanceStatus.Requested;
    public bool Escalated { get; set; }
    public string? AssignedTo { get; set; }
    public bool GuestConfirmed { get; set; }
    public string? AdminReview { get; set; }
    /// <summary>Filled by the store when empty.</summary>
    public string CreatedAt { get; set; } = "";
    public string? ResolvedAt { get; set; }
    public List<Note> Notes { get; set; } = [];
}

public class Notice
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    /// <summary>NoticeAudience constant.</summary>
    public string Audience { get; set; } = NoticeAudience.Guest;
    public string? GuestId { get; set; }
    public string? BookingId { get; set; }
    public string Message { get; set; } = "";
}

public class Refund
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public string BookingId { get; set; } = "";
    public string GuestName { get; set; } = "";
    /// <summary>RefundKind constant.</summary>
    public string Kind { get; set; } = RefundKind.Refund;
    public int Amount { get; set; }
    public string Reason { get; set; } = "";
    public string By { get; set; } = "";
}

public class AuditEvent
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public string Actor { get; set; } = "";
    public string Action { get; set; } = "";
    public string? BookingId { get; set; }
    /// <summary>Role of the person who did it (guest, receptionist, admin, root-admin) or "system". Null on entries written before roles were recorded.</summary>
    public string? Role { get; set; }
}
