using System.Text.Json.Serialization;

namespace Tampisaw.Models;

public class GuestMix
{
    public int Adult { get; set; }
    public int Child { get; set; }
    public int Senior { get; set; }
    public int Pwd { get; set; }

    /// <summary>Computed; not sent to the browser (the UI loops over the four guest kinds only).</summary>
    [JsonIgnore]
    public int Total => Adult + Child + Senior + Pwd;

    /// <summary>Access a count by GuestKind constant ("adult", "child", "senior", "pwd").</summary>
    public int this[string kind]
    {
        get => kind switch
        {
            GuestKind.Adult => Adult,
            GuestKind.Child => Child,
            GuestKind.Senior => Senior,
            GuestKind.Pwd => Pwd,
            _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown guest kind"),
        };
        set
        {
            switch (kind)
            {
                case GuestKind.Adult: Adult = value; break;
                case GuestKind.Child: Child = value; break;
                case GuestKind.Senior: Senior = value; break;
                case GuestKind.Pwd: Pwd = value; break;
                default: throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown guest kind");
            }
        }
    }
}

public class WaiverGuardian
{
    public string Name { get; set; } = "";
    public string Relationship { get; set; } = "";
    public string Contact { get; set; } = "";
    public string Signature { get; set; } = "";
    public int Minors { get; set; }
    public string SignedAt { get; set; } = "";
}

public class Waiver
{
    public string AcceptedAt { get; set; } = "";
    public string Version { get; set; } = "";
    public List<string> Rules { get; set; } = [];
    public Dictionary<string, bool> Health { get; set; } = [];
    /// <summary>Free text for the "other" health question; only kept when Health["other"] is true.</summary>
    public string? HealthOther { get; set; }
    public bool Flagged { get; set; }
    public bool DpaConsent { get; set; }
    public WaiverGuardian? Guardian { get; set; }
    public string Hash { get; set; } = "";
}

public class BookingAddon
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Qty { get; set; }
    public int Price { get; set; }
    public int Deposit { get; set; }
}

public class StaffApproval
{
    public string By { get; set; } = "";
    public string At { get; set; } = "";
}

public class BalanceProof
{
    public string Name { get; set; } = "";
    public string? Image { get; set; }
    public string SubmittedAt { get; set; } = "";
    /// <summary>BalanceProofStatus constant.</summary>
    public string Status { get; set; } = BalanceProofStatus.Submitted;
}

public class Bracelet
{
    public string Serial { get; set; } = "";
    public string Color { get; set; } = "";
    public string IssuedAt { get; set; } = "";
    public bool Voided { get; set; }
    public string? VoidReason { get; set; }
}

public class OvertimeCharge
{
    public int MinutesOver { get; set; }
    public double BilledHours { get; set; }
    public int Fee { get; set; }
    public string At { get; set; } = "";
    public string By { get; set; } = "";
}

public class Booking
{
    public string Id { get; set; } = "";
    public string GuestId { get; set; } = "";
    public string GuestName { get; set; } = "";
    public string Email { get; set; } = "";
    /// <summary>yyyy-MM-dd</summary>
    public string Date { get; set; } = "";
    public string SlotId { get; set; } = "";
    public int Guests { get; set; }
    /// <summary>BookingType constant.</summary>
    public string Type { get; set; } = BookingType.Pool;
    public string? CottageId { get; set; }
    /// <summary>Rented hours for cottage stays; never above the tariff duration cap.</summary>
    public int? CottageHours { get; set; }
    /// <summary>BookingStatus constant.</summary>
    public string Status { get; set; } = BookingStatus.Pending;
    /// <summary>Risk constant.</summary>
    public string Risk { get; set; } = Models.Risk.Low;
    public int Paid { get; set; }
    public int Total { get; set; }
    /// <summary>Local time-of-day text, e.g. "3:05 PM".</summary>
    public string? CheckedInAt { get; set; }
    public string? Phone { get; set; }
    public int? Adults { get; set; }
    public int? Children { get; set; }
    public int? Discounts { get; set; }
    /// <summary>PaymentStatus constant.</summary>
    public string PaymentStatus { get; set; } = Models.PaymentStatus.Unpaid;
    public StaffApproval? StaffApproval { get; set; }
    /// <summary>PayMethod constant ("cash" | "qr").</summary>
    public string? PaymentMethod { get; set; }
    /// <summary>Guest's intended arrival date (cash reservations): receptionist reviews, admin confirms.</summary>
    public string? ArrivalDate { get; set; }
    /// <summary>Guest's intended arrival time (cash reservations), e.g. "2:30 PM".</summary>
    public string? ArrivalTime { get; set; }
    public string? ProofName { get; set; }
    public string? ProofImage { get; set; }
    public BalanceProof? BalanceProof { get; set; }
    /// <summary>BalanceMethod constant.</summary>
    public string? BalanceMethod { get; set; }
    public string? PaymentDeadline { get; set; }
    /// <summary>BookingSource constant.</summary>
    public string? Source { get; set; }
    public string? EventStart { get; set; }
    public string? CreatedAt { get; set; }
    /// <summary>Amount required now: full for pool, downpayment % for cottage/room/event.</summary>
    public int? DueNow { get; set; }
    /// <summary>Receipt constant.</summary>
    public string? Receipt { get; set; }
    public bool AttendanceConfirmed { get; set; }
    public string? ReminderSentAt { get; set; }
    /// <summary>Set once the day-before in-app reminder was created.</summary>
    public string? DayBeforeReminderAt { get; set; }
    public string? WarnedAt { get; set; }
    public string? CancelRequestedAt { get; set; }
    /// <summary>"partial" (down payment) or "full": what the guest chose to pay when booking. Pool entry is always "full".</summary>
    public string? PaymentOption { get; set; }
    /// <summary>Soft delete: archived bookings leave the working lists and never block availability, but stay in reports and can be restored.</summary>
    public bool Archived { get; set; }
    public string? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
    public string? TimeIn { get; set; }
    public string? TimeOut { get; set; }
    public bool? BraceletReturned { get; set; }
    public List<Bracelet> Bracelets { get; set; } = [];
    /// <summary>WalkInOption constant.</summary>
    public string? WalkInOption { get; set; }
    public GuestMix? Mix { get; set; }
    public List<BookingAddon> Addons { get; set; } = [];
    public int? AddonDeposit { get; set; }
    public Waiver? Waiver { get; set; }
    public string? QrToken { get; set; }
    public string? CheckedInAtISO { get; set; }
    public int? SessionMinutes { get; set; }
    public string? ExpiryAlertSentAt { get; set; }
    public OvertimeCharge? Overtime { get; set; }
    /// <summary>Why the booking was cancelled: the guest's optional explanation (up to 500 characters), or the system/staff reason.</summary>
    public string? CancelReason { get; set; }
}

public class DraftBooking
{
    public string Date { get; set; } = "";
    public string SlotId { get; set; } = SlotIds.DayTour;
    public int Guests { get; set; }
    public string Type { get; set; } = BookingType.Pool;
    public string? CottageId { get; set; }
    public int? CottageHours { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public int Adults { get; set; }
    public int Children { get; set; }
    public int Discounts { get; set; }
    public string? EventStart { get; set; }
    public GuestMix? Mix { get; set; }
    public List<BookingAddon>? Addons { get; set; }
    public Waiver? Waiver { get; set; }
}

public class Hold
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string SlotId { get; set; } = "";
    public int Guests { get; set; }
    public string? CottageId { get; set; }
    /// <summary>Event block (e.g. "8:00 AM – 12:00 PM") so two different blocks of the same pavilion do not block each other.</summary>
    public string? EventStart { get; set; }
    /// <summary>The guest who is checking out; their own hold never blocks them.</summary>
    public string? GuestId { get; set; }
    public string ExpiresAt { get; set; } = "";
}
