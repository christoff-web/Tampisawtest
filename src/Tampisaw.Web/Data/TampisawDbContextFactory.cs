using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Tampisaw.Data;

/// <summary>
/// Used only by the EF tools (Add-Migration, Update-Database). Always targets SQL Server; set the TAMPISAW_CONNECTION
/// environment variable to point the tools somewhere other than LocalDB.
/// </summary>
public sealed class TampisawDbContextFactory : IDesignTimeDbContextFactory<TampisawDbContext>
{
    public TampisawDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("TAMPISAW_CONNECTION") ?? DatabaseOptions.DefaultSqlServerConnection;
        var options = new DbContextOptionsBuilder<TampisawDbContext>().UseSqlServer(cs).Options;
        return new TampisawDbContext(options);
    }
}
