using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Tampisaw.Data;

/// <summary>What the status line of the admin footer shows.</summary>
public record DatabaseInfo(string Provider, string Target, bool Connected, string? LastError, string? LastSavedAt)
{
    public static readonly DatabaseInfo None = new("None", "in-memory only (changes are not saved)", true, null, null);

    /// <summary>"Connected to SQL Server (.\SQLEXPRESS / Tampisaw)" or "Database error: ...".</summary>
    public string Summary => Connected ? $"Connected to {Provider} ({Target})" : $"Database error ({Provider}, {Target}): {LastError}";
}

/// <summary>The system uses Microsoft SQL Server only. Reads ConnectionStrings:Tampisaw from configuration (user-secrets or an environment variable for anything with a password).</summary>
public sealed record DatabaseOptions(string Provider, string ConnectionString)
{
    public const string SqlServer = "SqlServer";
    public const string DefaultSqlServerConnection = @"Server=AlexonFrancisco\SQLEXPRESS;Database=Tampisaw;Trusted_Connection=True;TrustServerCertificate=True";

    public static DatabaseOptions From(Microsoft.Extensions.Configuration.IConfiguration config)
    {
        var cs = config.GetConnectionString("Tampisaw");
        if (string.IsNullOrWhiteSpace(cs)) cs = DefaultSqlServerConnection;
        return new DatabaseOptions(SqlServer, cs);
    }

    public DbContextOptions<TampisawDbContext> BuildContextOptions()
    {
        var b = new DbContextOptionsBuilder<TampisawDbContext>();
        b.UseSqlServer(ConnectionString);
        // The migration for the root admin changes was written by hand; a slightly different snapshot must never stop the system from starting.
        b.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
        return b.Options;
    }

    /// <summary>Human readable target without credentials.</summary>
    public string Describe()
    {
        try
        {
            var sb = new SqlConnectionStringBuilder(ConnectionString);
            return $"{sb.DataSource} / {sb.InitialCatalog}";
        }
        catch (ArgumentException)
        {
            return "custom connection string";
        }
    }
}
