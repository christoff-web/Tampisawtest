using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tampisaw.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Addons",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Price = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DailyCap = table.Column<int>(type: "int", nullable: false),
                    Deposit = table.Column<int>(type: "int", nullable: false),
                    Image = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Addons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AuditLog",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Actor = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Blackouts",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Date = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Blackouts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Bookings",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Date = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Guests = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CottageId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CottageHours = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Risk = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Paid = table.Column<int>(type: "int", nullable: false),
                    Total = table.Column<int>(type: "int", nullable: false),
                    CheckedInAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Adults = table.Column<int>(type: "int", nullable: true),
                    Children = table.Column<int>(type: "int", nullable: true),
                    Discounts = table.Column<int>(type: "int", nullable: true),
                    PaymentStatus = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StaffApproval = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PaymentMethod = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArrivalDate = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArrivalTime = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ProofName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ProofImage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    BalanceProof = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    BalanceMethod = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PaymentDeadline = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    EventStart = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DueNow = table.Column<int>(type: "int", nullable: true),
                    Receipt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AttendanceConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    ReminderSentAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DayBeforeReminderAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    WarnedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CancelRequestedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TimeIn = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TimeOut = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    BraceletReturned = table.Column<bool>(type: "bit", nullable: true),
                    Bracelets = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WalkInOption = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Mix = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Addons = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AddonDeposit = table.Column<int>(type: "int", nullable: true),
                    Waiver = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    QrToken = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CheckedInAtISO = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SessionMinutes = table.Column<int>(type: "int", nullable: true),
                    ExpiryAlertSentAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Overtime = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CancelReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bookings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BraceletLog",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    By = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BraceletLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Cottages",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Capacity = table.Column<int>(type: "int", nullable: false),
                    Price = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Image = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amenities = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Units = table.Column<int>(type: "int", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cottages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Draft",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Guests = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CottageId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CottageHours = table.Column<int>(type: "int", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Adults = table.Column<int>(type: "int", nullable: false),
                    Children = table.Column<int>(type: "int", nullable: false),
                    Discounts = table.Column<int>(type: "int", nullable: false),
                    EventStart = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Mix = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Addons = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Waiver = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Draft", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Guests",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Visits = table.Column<int>(type: "int", nullable: false),
                    Cancellations = table.Column<int>(type: "int", nullable: false),
                    NoShows = table.Column<int>(type: "int", nullable: false),
                    DamageFees = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastVisit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Risk = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Guests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Holds",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Date = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Guests = table.Column<int>(type: "int", nullable: false),
                    CottageId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ExpiresAt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Holds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Incidents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    GuestName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Location = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Serious = table.Column<bool>(type: "bit", nullable: false),
                    Escalated = table.Column<bool>(type: "bit", nullable: false),
                    GuestConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    AdminReview = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResolvedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Incidents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Lifeguards",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Lifeguards", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Maintenance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    GuestName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Area = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Concern = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Details = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Urgent = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Escalated = table.Column<bool>(type: "bit", nullable: false),
                    AssignedTo = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    GuestConfirmed = table.Column<bool>(type: "bit", nullable: false),
                    AdminReview = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResolvedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Maintenance", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Notices",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Audience = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Message = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OpsConfig",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    GuestsPerLifeguard = table.Column<int>(type: "int", nullable: false),
                    MinLifeguardsPerShift = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpsConfig", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Policies",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Policies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PoolLogs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Ph = table.Column<double>(type: "float", nullable: false),
                    Chlorine = table.Column<double>(type: "float", nullable: false),
                    Backwash = table.Column<bool>(type: "bit", nullable: false),
                    Cleaned = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    By = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PoolLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Refunds",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    By = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Refunds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Roster",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Date = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Shift = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    GuardId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ScanHistory",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Line = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScanHistory", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    PeakSeason = table.Column<bool>(type: "bit", nullable: false),
                    Hold = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OnlinePaymentMinutes = table.Column<int>(type: "int", nullable: false),
                    ConfirmationHours = table.Column<int>(type: "int", nullable: false),
                    CancellationHours = table.Column<int>(type: "int", nullable: false),
                    DownpaymentPct = table.Column<int>(type: "int", nullable: false),
                    RiskRules = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ShiftReports",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ClosedAt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    By = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    OpeningFloat = table.Column<int>(type: "int", nullable: false),
                    ExpectedCash = table.Column<int>(type: "int", nullable: false),
                    CountedCash = table.Column<int>(type: "int", nullable: false),
                    Variance = table.Column<int>(type: "int", nullable: false),
                    Denominations = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftReports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Slots",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Time = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Capacity = table.Column<int>(type: "int", nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Slots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Staff",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Staff", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SyncQueue",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    BookingId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    At = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    By = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SyncedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncQueue", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tariff",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Rates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StatutoryDiscountPct = table.Column<int>(type: "int", nullable: false),
                    Overtime = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DurationCapHours = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiryAlertMinutes = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tariff", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    Birthdate = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FaceImage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Waitlist",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GuestId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Date = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CottageId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Guests = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NotifiedAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ExpiresAt = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Waitlist", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_BookingId",
                table: "AuditLog",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Blackouts_Date",
                table: "Blackouts",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_Date_SlotId",
                table: "Bookings",
                columns: new[] { "Date", "SlotId" });

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_GuestId",
                table: "Bookings",
                column: "GuestId");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_Status",
                table: "Bookings",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_BraceletLog_BookingId",
                table: "BraceletLog",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Guests_Email",
                table: "Guests",
                column: "Email",
                unique: true,
                filter: "[Email] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_Holds_Date_SlotId",
                table: "Holds",
                columns: new[] { "Date", "SlotId" });

            migrationBuilder.CreateIndex(
                name: "IX_Incidents_BookingId",
                table: "Incidents",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Incidents_GuestId",
                table: "Incidents",
                column: "GuestId");

            migrationBuilder.CreateIndex(
                name: "IX_Maintenance_GuestId",
                table: "Maintenance",
                column: "GuestId");

            migrationBuilder.CreateIndex(
                name: "IX_Notices_Audience_GuestId",
                table: "Notices",
                columns: new[] { "Audience", "GuestId" });

            migrationBuilder.CreateIndex(
                name: "IX_Notices_BookingId",
                table: "Notices",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Refunds_BookingId",
                table: "Refunds",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Roster_Date",
                table: "Roster",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftReports_By",
                table: "ShiftReports",
                column: "By");

            migrationBuilder.CreateIndex(
                name: "IX_SyncQueue_BookingId",
                table: "SyncQueue",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_GuestId",
                table: "Users",
                column: "GuestId");

            migrationBuilder.CreateIndex(
                name: "IX_Waitlist_Date_SlotId",
                table: "Waitlist",
                columns: new[] { "Date", "SlotId" });

            migrationBuilder.CreateIndex(
                name: "IX_Waitlist_GuestId",
                table: "Waitlist",
                column: "GuestId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Addons");

            migrationBuilder.DropTable(
                name: "AuditLog");

            migrationBuilder.DropTable(
                name: "Blackouts");

            migrationBuilder.DropTable(
                name: "Bookings");

            migrationBuilder.DropTable(
                name: "BraceletLog");

            migrationBuilder.DropTable(
                name: "Cottages");

            migrationBuilder.DropTable(
                name: "Draft");

            migrationBuilder.DropTable(
                name: "Guests");

            migrationBuilder.DropTable(
                name: "Holds");

            migrationBuilder.DropTable(
                name: "Incidents");

            migrationBuilder.DropTable(
                name: "Lifeguards");

            migrationBuilder.DropTable(
                name: "Maintenance");

            migrationBuilder.DropTable(
                name: "Notices");

            migrationBuilder.DropTable(
                name: "OpsConfig");

            migrationBuilder.DropTable(
                name: "Policies");

            migrationBuilder.DropTable(
                name: "PoolLogs");

            migrationBuilder.DropTable(
                name: "Refunds");

            migrationBuilder.DropTable(
                name: "Roster");

            migrationBuilder.DropTable(
                name: "ScanHistory");

            migrationBuilder.DropTable(
                name: "Settings");

            migrationBuilder.DropTable(
                name: "ShiftReports");

            migrationBuilder.DropTable(
                name: "Slots");

            migrationBuilder.DropTable(
                name: "Staff");

            migrationBuilder.DropTable(
                name: "SyncQueue");

            migrationBuilder.DropTable(
                name: "Tariff");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Waitlist");
        }
    }
}
