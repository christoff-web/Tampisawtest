#if NODB
namespace Tampisaw.Data;

// Only compiled with -p:NoDb=true (developer smoke tests without NuGet). The normal build uses DatabaseOptions.cs.
public record DatabaseInfo(string Provider, string Target, bool Connected, string? LastError, string? LastSavedAt)
{
    public static readonly DatabaseInfo None = new("None", "in-memory only (changes are not saved)", true, null, null);
    public string Summary => Connected ? $"Connected to {Provider} ({Target})" : $"Database error: {LastError}";
}
#endif
