using Tampisaw.Models;

namespace Tampisaw.Data;

/// <summary>Where AppStore keeps its data. AppStore holds everything in memory and calls Save after every edit.</summary>
public interface IStatePersistence
{
    DatabaseInfo Info { get; }

    /// <summary>Create/upgrade the schema, then load the stored state. When the database is empty, seed() is stored and returned.</summary>
    AppState LoadOrSeed(Func<AppState> seed);

    /// <summary>Write whatever differs from the last saved state (in one transaction). Returns false (and records the error in Info) when the write failed; the next Save retries.</summary>
    bool Save(AppState state);

    /// <summary>Delete every row and store the given state instead.</summary>
    void Reset(AppState seed);
}
