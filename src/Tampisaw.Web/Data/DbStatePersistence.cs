using Microsoft.EntityFrameworkCore;
using Tampisaw.Models;

namespace Tampisaw.Data;

/// <summary>
/// Write-through persistence of AppState with EF Core. The in-memory graph stays the source of truth for the UI; after each
/// edit this class serialises every row, compares it with the last saved snapshot and issues INSERT / UPDATE / DELETE only
/// for rows that changed, all inside one SaveChanges transaction. If a write fails the snapshot is left untouched, so the
/// next Save re-sends the difference. Not thread-safe by itself: AppStore calls it under its own lock (it also locks internally).
/// </summary>
public sealed class DbStatePersistence : IStatePersistence
{
    private readonly object _sync = new();
    private readonly DatabaseOptions _options;
    private readonly DbContextOptions<TampisawDbContext> _contextOptions;
    private readonly ILogger? _log;
    private readonly ITableSync[] _tables = BuildTables();

    public DbStatePersistence(DatabaseOptions options, ILogger<DbStatePersistence>? log = null)
    {
        _options = options;
        _contextOptions = options.BuildContextOptions();
        _log = log;
        Info = new DatabaseInfo("SQL Server", options.Describe(), false, "Not connected yet", null);
    }

    public DatabaseInfo Info { get; private set; }

    private TampisawDbContext NewContext() => new(_contextOptions);

    public AppState LoadOrSeed(Func<AppState> seed)
    {
        lock (_sync)
        {
            try
            {
                using var db = NewContext();
                try
                {
                    db.Database.Migrate();
                }
                catch (Exception ex) when (ShouldResetDatabase(ex))
                {
                    db.Database.EnsureDeleted();
                    db.Database.Migrate();
                }

                if (!HasColumn(db, "Settings", "Contact"))
                {
                    db.Database.EnsureDeleted();
                    db.Database.Migrate();
                }

                var state = new AppState();
                if (db.Set<Settings>().AsNoTracking().Any())
                {
                    foreach (var t in _tables) t.Load(db, state);
                    MarkOk();
                    return state;
                }
                var fresh = seed();
                WriteAll(fresh, clear: false);
                return fresh;
            }
            catch (Exception ex)
            {
                MarkFailed(ex);
                throw new InvalidOperationException(
                    $"Could not open the {Info.Provider} database ({Info.Target}). Check ConnectionStrings:Tampisaw in appsettings.json and that SQL Server is running. {ex.GetBaseException().Message}", ex);
            }
        }
    }

    private static bool ShouldResetDatabase(Exception ex)
    {
        var msg = ex.GetBaseException().Message;
        return msg.Contains("Column names in each table must be unique", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("duplicate column", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("The migration history table is not present", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("There is already an object named", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasColumn(TampisawDbContext db, string tableName, string columnName)
    {
        var connection = db.Database.GetDbConnection();
        var wasOpen = connection.State == System.Data.ConnectionState.Open;
        if (!wasOpen) connection.Open();
        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT CASE WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName) THEN 1 ELSE 0 END";
            var tableParam = cmd.CreateParameter();
            tableParam.ParameterName = "@tableName";
            tableParam.Value = tableName;
            var columnParam = cmd.CreateParameter();
            columnParam.ParameterName = "@columnName";
            columnParam.Value = columnName;
            cmd.Parameters.Add(tableParam);
            cmd.Parameters.Add(columnParam);
            return Convert.ToInt32(cmd.ExecuteScalar()) == 1;
        }
        finally
        {
            if (!wasOpen) connection.Close();
        }
    }

    public bool Save(AppState state)
    {
        lock (_sync)
        {
            try
            {
                WriteAll(state, clear: false);
                return true;
            }
            catch (Exception ex)
            {
                MarkFailed(ex);
                return false;
            }
        }
    }

    public void Reset(AppState seed)
    {
        lock (_sync)
        {
            try
            {
                WriteAll(seed, clear: true);
            }
            catch (Exception ex)
            {
                MarkFailed(ex);
                throw;
            }
        }
    }

    private void WriteAll(AppState state, bool clear)
    {
        using var db = NewContext();
        using var tx = db.Database.BeginTransaction();
        if (clear)
        {
            db.Set<User>().ExecuteDelete(); db.Set<Guest>().ExecuteDelete(); db.Set<Booking>().ExecuteDelete();
            db.Set<Cottage>().ExecuteDelete(); db.Set<Slot>().ExecuteDelete(); db.Set<Policy>().ExecuteDelete();
            db.Set<Hold>().ExecuteDelete(); db.Set<AuditEvent>().ExecuteDelete(); db.Set<StaffAccount>().ExecuteDelete();
            db.Set<Blackout>().ExecuteDelete(); db.Set<Incident>().ExecuteDelete(); db.Set<MaintenanceRequest>().ExecuteDelete();
            db.Set<Notice>().ExecuteDelete(); db.Set<Refund>().ExecuteDelete(); db.Set<BraceletEvent>().ExecuteDelete();
            db.Set<Addon>().ExecuteDelete(); db.Set<Lifeguard>().ExecuteDelete(); db.Set<RosterEntry>().ExecuteDelete();
            db.Set<PoolLog>().ExecuteDelete(); db.Set<WaitlistEntry>().ExecuteDelete(); db.Set<ShiftReport>().ExecuteDelete();
            db.Set<SyncItem>().ExecuteDelete(); db.Set<ScanEntry>().ExecuteDelete(); db.Set<Settings>().ExecuteDelete();
            db.Set<Tariff>().ExecuteDelete(); db.Set<OpsConfig>().ExecuteDelete(); db.Set<DraftBooking>().ExecuteDelete();
        }
        var commits = _tables.Select(t => t.Stage(state, db, fromEmpty: clear)).ToList();
        db.SaveChanges();
        tx.Commit();
        foreach (var commit in commits) commit();
        MarkOk();
    }

    private void MarkOk() => Info = Info with { Connected = true, LastError = null, LastSavedAt = Ops_NowIso() };

    private void MarkFailed(Exception ex)
    {
        var msg = ex.GetBaseException().Message;
        _log?.LogError(ex, "Database write/load failed");
        Info = Info with { Connected = false, LastError = msg };
    }

    private static string Ops_NowIso() => Tampisaw.Services.Ops.NowIso();

    // ------------------------------------------------------------------ per-table synchronisation

    private interface ITableSync
    {
        void Load(TampisawDbContext db, AppState state);

        /// <summary>Queue inserts/updates/deletes on db and return the action that adopts the new snapshot once they were committed.</summary>
        Action Stage(AppState state, TampisawDbContext db, bool fromEmpty);
    }

    private readonly record struct Row(string Json, long Seq);

    private sealed class ListTable<T>(
        Func<AppState, IEnumerable<T>> get,
        Action<AppState, List<T>> set,
        Func<T, string> key,
        Action<T, string> setKey,
        bool newestFirst) : ITableSync where T : class, new()
    {
        private Dictionary<string, Row> _known = [];
        private long _maxSeq;

        public void Load(TampisawDbContext db, AppState state)
        {
            var rows = db.Set<T>().AsNoTracking()
                .Select(e => new { Entity = e, Seq = EF.Property<long>(e, "Seq") })
                .OrderBy(r => r.Seq)
                .ToList();
            _known = [];
            foreach (var r in rows) _known[key(r.Entity)] = new Row(JsonColumns.Serialize(r.Entity), r.Seq);
            _maxSeq = rows.Count == 0 ? 0 : rows.Max(r => r.Seq);
            var entities = rows.Select(r => r.Entity).ToList();
            if (newestFirst) entities.Reverse();
            set(state, entities);
        }

        public Action Stage(AppState state, TampisawDbContext db, bool fromEmpty)
        {
            var known = fromEmpty ? [] : _known;
            var maxSeq = fromEmpty ? 0 : _maxSeq;
            var next = new Dictionary<string, Row>();
            var fresh = new List<(T Entity, string Key, string Json)>();
            foreach (var e in get(state))
            {
                var k = key(e);
                if (next.ContainsKey(k) || fresh.Any(f => f.Key == k)) continue; // duplicate id: first one wins
                var json = JsonColumns.Serialize(e);
                if (known.TryGetValue(k, out var row))
                {
                    next[k] = row with { Json = json };
                    if (row.Json != json)
                    {
                        var entry = db.Entry(e);
                        entry.Property("Seq").CurrentValue = row.Seq;
                        entry.State = EntityState.Modified;
                    }
                }
                else fresh.Add((e, k, json));
            }
            for (var i = 0; i < fresh.Count; i++)
            {
                var seq = newestFirst ? maxSeq + (fresh.Count - i) : maxSeq + 1 + i;
                var entry = db.Entry(fresh[i].Entity);
                entry.Property("Seq").CurrentValue = seq;
                entry.State = EntityState.Added;
                next[fresh[i].Key] = new Row(fresh[i].Json, seq);
            }
            foreach (var k in known.Keys)
            {
                if (next.ContainsKey(k)) continue;
                var stub = new T();
                setKey(stub, k);
                db.Entry(stub).State = EntityState.Deleted;
            }
            var newMax = fresh.Count == 0 ? maxSeq : maxSeq + fresh.Count;
            return () =>
            {
                _known = next;
                _maxSeq = newMax;
            };
        }
    }

    private sealed class SingleTable<T>(Func<AppState, T> get, Action<AppState, T> set) : ITableSync where T : class, new()
    {
        private string? _json;

        public void Load(TampisawDbContext db, AppState state)
        {
            var value = db.Set<T>().AsNoTracking().FirstOrDefault();
            if (value is null)
            {
                _json = null;
                return;
            }
            _json = JsonColumns.Serialize(value);
            set(state, value);
        }

        public Action Stage(AppState state, TampisawDbContext db, bool fromEmpty)
        {
            var value = get(state);
            var json = JsonColumns.Serialize(value);
            var exists = !fromEmpty && _json is not null;
            if (!exists || _json != json)
            {
                var entry = db.Entry(value);
                entry.Property("Id").CurrentValue = 1;
                entry.State = exists ? EntityState.Modified : EntityState.Added;
            }
            return () => _json = json;
        }
    }

    private static ITableSync[] BuildTables() =>
    [
        new ListTable<User>(s => s.Users, (s, l) => s.Users = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Guest>(s => s.Guests, (s, l) => s.Guests = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Booking>(s => s.Bookings, (s, l) => s.Bookings = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<Cottage>(s => s.Cottages, (s, l) => s.Cottages = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Slot>(s => s.Slots, (s, l) => s.Slots = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Policy>(s => s.Policies, (s, l) => s.Policies = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Hold>(s => s.Holds, (s, l) => s.Holds = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<AuditEvent>(s => s.AuditLog, (s, l) => s.AuditLog = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<StaffAccount>(s => s.Staff, (s, l) => s.Staff = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Blackout>(s => s.Blackouts, (s, l) => s.Blackouts = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<Incident>(s => s.Incidents, (s, l) => s.Incidents = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<MaintenanceRequest>(s => s.Maintenance, (s, l) => s.Maintenance = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<Notice>(s => s.Notices, (s, l) => s.Notices = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<Refund>(s => s.Refunds, (s, l) => s.Refunds = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<BraceletEvent>(s => s.BraceletLog, (s, l) => s.BraceletLog = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<Addon>(s => s.Addons, (s, l) => s.Addons = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<Lifeguard>(s => s.Lifeguards, (s, l) => s.Lifeguards = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<RosterEntry>(s => s.Roster, (s, l) => s.Roster = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<PoolLog>(s => s.PoolLogs, (s, l) => s.PoolLogs = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<WaitlistEntry>(s => s.Waitlist, (s, l) => s.Waitlist = l, e => e.Id, (e, k) => e.Id = k, false),
        new ListTable<ShiftReport>(s => s.ShiftReports, (s, l) => s.ShiftReports = l, e => e.Id, (e, k) => e.Id = k, true),
        new ListTable<SyncItem>(s => s.SyncQueue, (s, l) => s.SyncQueue = l, e => e.Id, (e, k) => e.Id = k, true),
        // Scan history is a list of strings: each line is stored under its index (newest line = index 0).
        new ListTable<ScanEntry>(
            s => s.ScanHistory.Select((line, i) => new ScanEntry { Id = i.ToString(), Line = line }),
            (s, l) => s.ScanHistory = l.OrderBy(x => int.Parse(x.Id)).Select(x => x.Line).ToList(),
            e => e.Id, (e, k) => e.Id = k, false),
        new SingleTable<Settings>(s => s.Settings, (s, v) => s.Settings = v),
        new SingleTable<Tariff>(s => s.Tariff, (s, v) => s.Tariff = v),
        new SingleTable<OpsConfig>(s => s.OpsConfig, (s, v) => s.OpsConfig = v),
        new SingleTable<DraftBooking>(s => s.Draft, (s, v) => s.Draft = v),
    ];
}
