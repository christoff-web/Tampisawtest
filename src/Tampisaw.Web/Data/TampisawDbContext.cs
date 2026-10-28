    using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System.Text.Json;
using Tampisaw.Models;

namespace Tampisaw.Data;

/// <summary>One persisted line of AppState.ScanHistory (Id is the line's index).</summary>
public class ScanEntry
{
    public string Id { get; set; } = "";
    public string Line { get; set; } = "";
}

/// <summary>
/// Relational schema for the whole AppState. Every list in AppState is one table keyed by the model's string Id
/// (plus a hidden "Seq" column that preserves list order). Nested objects and lists (waiver, bracelets, add-ons, ...)
/// are stored as JSON text columns. Settings, Tariff, OpsConfig and Draft are single-row tables (hidden Id = 1).
/// Foreign-key columns (GuestId, BookingId, ...) are plain indexed columns without constraints, because deleting or
/// anonymising an account intentionally leaves some rows pointing at an empty id.
/// </summary>
public class TampisawDbContext(DbContextOptions<TampisawDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Guest> Guests => Set<Guest>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<Cottage> Cottages => Set<Cottage>();
    public DbSet<Slot> Slots => Set<Slot>();
    public DbSet<Policy> Policies => Set<Policy>();
    public DbSet<Hold> Holds => Set<Hold>();
    public DbSet<AuditEvent> AuditLog => Set<AuditEvent>();
    public DbSet<StaffAccount> Staff => Set<StaffAccount>();
    public DbSet<Blackout> Blackouts => Set<Blackout>();
    public DbSet<Incident> Incidents => Set<Incident>();
    public DbSet<MaintenanceRequest> Maintenance => Set<MaintenanceRequest>();
    public DbSet<Notice> Notices => Set<Notice>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<BraceletEvent> BraceletLog => Set<BraceletEvent>();
    public DbSet<Addon> Addons => Set<Addon>();
    public DbSet<Lifeguard> Lifeguards => Set<Lifeguard>();
    public DbSet<RosterEntry> Roster => Set<RosterEntry>();
    public DbSet<PoolLog> PoolLogs => Set<PoolLog>();
    public DbSet<WaitlistEntry> Waitlist => Set<WaitlistEntry>();
    public DbSet<ShiftReport> ShiftReports => Set<ShiftReport>();
    public DbSet<SyncItem> SyncQueue => Set<SyncItem>();
    public DbSet<ScanEntry> ScanHistory => Set<ScanEntry>();
    public DbSet<Settings> Settings => Set<Settings>();
    public DbSet<Tariff> Tariff => Set<Tariff>();
    public DbSet<OpsConfig> OpsConfig => Set<OpsConfig>();
    public DbSet<DraftBooking> Draft => Set<DraftBooking>();

    private const int IdLength = 100;

    protected override void OnModelCreating(ModelBuilder m)
    {
        Table<User>(m, "Users", e =>
        {
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Role).HasMaxLength(32);
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.GuestId);
        });
        Table<Guest>(m, "Guests", e =>
        {
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.DamageFees).AsJson();
            // Guests without an email (none today) must not collide with each other.
            e.HasIndex(x => x.Email).IsUnique().HasFilter("[Email] <> ''");
        });
        Table<Booking>(m, "Bookings", e =>
        {
            e.Property(x => x.GuestId).HasMaxLength(IdLength);
            e.Property(x => x.Date).HasMaxLength(10);
            e.Property(x => x.SlotId).HasMaxLength(64);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.CottageId).HasMaxLength(IdLength);
            e.Property(x => x.StaffApproval).AsJson();
            e.Property(x => x.BalanceProof).AsJson();
            e.Property(x => x.Bracelets).AsJson();
            e.Property(x => x.Mix).AsJson();
            e.Property(x => x.Addons).AsJson();
            e.Property(x => x.Waiver).AsJson();
            e.Property(x => x.Overtime).AsJson();
            e.HasIndex(x => new { x.Date, x.SlotId });
            e.HasIndex(x => x.GuestId);
            e.HasIndex(x => x.Status);
        });
        Table<Cottage>(m, "Cottages", e => e.Property(x => x.Amenities).AsJson());
        Table<Slot>(m, "Slots");
        Table<Policy>(m, "Policies");
        Table<Hold>(m, "Holds", e =>
        {
            e.Property(x => x.Date).HasMaxLength(10);
            e.Property(x => x.SlotId).HasMaxLength(64);
            e.HasIndex(x => new { x.Date, x.SlotId });
        });
        Table<AuditEvent>(m, "AuditLog", e =>
        {
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.HasIndex(x => x.BookingId);
        });
        Table<StaffAccount>(m, "Staff");
        Table<Blackout>(m, "Blackouts", e =>
        {
            e.Property(x => x.Date).HasMaxLength(10);
            e.HasIndex(x => x.Date);
        });
        Table<Incident>(m, "Incidents", e =>
        {
            e.Property(x => x.GuestId).HasMaxLength(IdLength);
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.Property(x => x.Notes).AsJson();
            e.HasIndex(x => x.GuestId);
            e.HasIndex(x => x.BookingId);
        });
        Table<MaintenanceRequest>(m, "Maintenance", e =>
        {
            e.Property(x => x.GuestId).HasMaxLength(IdLength);
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.Property(x => x.Notes).AsJson();
            e.HasIndex(x => x.GuestId);
        });
        Table<Notice>(m, "Notices", e =>
        {
            e.Property(x => x.GuestId).HasMaxLength(IdLength);
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.Property(x => x.Audience).HasMaxLength(32);
            e.HasIndex(x => new { x.Audience, x.GuestId });
            e.HasIndex(x => x.BookingId);
        });
        Table<Refund>(m, "Refunds", e =>
        {
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.HasIndex(x => x.BookingId);
        });
        Table<BraceletEvent>(m, "BraceletLog", e =>
        {
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.HasIndex(x => x.BookingId);
        });
        Table<Addon>(m, "Addons");
        Table<Lifeguard>(m, "Lifeguards");
        Table<RosterEntry>(m, "Roster", e =>
        {
            e.Property(x => x.Date).HasMaxLength(10);
            e.HasIndex(x => x.Date);
        });
        Table<PoolLog>(m, "PoolLogs");
        Table<WaitlistEntry>(m, "Waitlist", e =>
        {
            e.Property(x => x.GuestId).HasMaxLength(IdLength);
            e.Property(x => x.Date).HasMaxLength(10);
            e.Property(x => x.SlotId).HasMaxLength(64);
            e.HasIndex(x => new { x.Date, x.SlotId });
            e.HasIndex(x => x.GuestId);
        });
        Table<ShiftReport>(m, "ShiftReports", e =>
        {
            e.Property(x => x.By).HasMaxLength(256);
            e.Property(x => x.Denominations).AsJson();
            e.HasIndex(x => x.By);
        });
        Table<SyncItem>(m, "SyncQueue", e =>
        {
            e.Property(x => x.BookingId).HasMaxLength(IdLength);
            e.HasIndex(x => x.BookingId);
        });
        Table<ScanEntry>(m, "ScanHistory");

        Single<Settings>(m, "Settings", e =>
        {
            e.Property(x => x.Hold).AsJson();
            e.Property(x => x.RiskRules).AsJson();
            e.Property(x => x.Contact).AsJson();
        });
        Single<Tariff>(m, "Tariff", e =>
        {
            e.Property(x => x.Rates).AsJson();
            e.Property(x => x.Overtime).AsJson();
            e.Property(x => x.DurationCapHours).AsJson();
        });
        Single<OpsConfig>(m, "OpsConfig");
        Single<DraftBooking>(m, "Draft", e =>
        {
            e.Property(x => x.Mix).AsJson();
            e.Property(x => x.Addons).AsJson();
            e.Property(x => x.Waiver).AsJson();
        });
    }

    /// <summary>List table: string key "Id" plus hidden "Seq" (position in the in-memory list).</summary>
    private static void Table<T>(ModelBuilder m, string name, Action<EntityTypeBuilder<T>>? configure = null) where T : class
    {
        m.Entity<T>(e =>
        {
            e.ToTable(name);
            e.HasKey("Id");
            e.Property<string>("Id").HasMaxLength(IdLength).ValueGeneratedNever();
            e.Property<long>("Seq");
            configure?.Invoke(e);
        });
    }

    /// <summary>Single-row table with a hidden key column Id (always 1).</summary>
    private static void Single<T>(ModelBuilder m, string name, Action<EntityTypeBuilder<T>>? configure = null) where T : class
    {
        m.Entity<T>(e =>
        {
            e.ToTable(name);
            e.Property<int>("Id").ValueGeneratedNever();
            e.HasKey("Id");
            configure?.Invoke(e);
        });
    }
}

internal static class JsonColumns
{
    private static readonly JsonSerializerOptions Options = new();

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T Deserialize<T>(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Activator.CreateInstance<T>() ?? throw new InvalidOperationException($"Cannot create a default instance of type '{typeof(T).Name}'.");
        }

        return JsonSerializer.Deserialize<T>(json, Options)
            ?? Activator.CreateInstance<T>()
            ?? throw new InvalidOperationException($"Could not deserialize JSON into '{typeof(T).Name}'.");
    }

    /// <summary>Store a nested object or list as JSON text.</summary>
    public static PropertyBuilder<T> AsJson<T>(this PropertyBuilder<T> property)
    {
        var converter = new ValueConverter<T, string>(v => Serialize(v), s => Deserialize<T>(s));
        var comparer = new ValueComparer<T>(
            (a, b) => Serialize(a) == Serialize(b),
            v => Serialize(v).GetHashCode(),
            v => Deserialize<T>(Serialize(v)));
        property.HasConversion(converter, comparer);
        return property;
    }
}
