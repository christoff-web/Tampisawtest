using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 *  Admin analytics and safety (AppStore.Analytics.cs)
 *  AllShiftReports()                          every staff member's shift reports, newest first
 *  AddLifeguard(name, by) / SetLifeguardActive(id, active, by)
 *  AddPoolReading(ph, chlorine, temperature?, backwash, cleaned, notes, by)   pool water log with water temperature
 */
public sealed partial class AppStore
{
    public List<ShiftReport> AllShiftReports() =>
        Read(s => s.ShiftReports.OrderByDescending(r => r.ClosedAt, StringComparer.Ordinal).ToList());

    public void AddLifeguard(string name, string by) => Edit(s =>
    {
        var clean = name.Trim();
        if (clean.Length == 0 || s.Lifeguards.Any(g => g.Name.Equals(clean, StringComparison.OrdinalIgnoreCase))) return;
        s.Lifeguards = [.. s.Lifeguards, new Lifeguard { Id = NewId("LG"), Name = clean, Active = true }];
        Push(s, Audit($"Added lifeguard {clean}", null, by));
    });

    public void SetLifeguardActive(string id, bool active, string by) => Edit(s =>
    {
        var g = s.Lifeguards.FirstOrDefault(x => x.Id == id);
        if (g is null || g.Active == active) return;
        g.Active = active;
        Push(s, Audit($"{(active ? "Reactivated" : "Deactivated")} lifeguard {g.Name}", null, by));
    });

    public void AddPoolReading(double ph, double chlorine, double? temperature, bool backwash, bool cleaned, string notes, string by) =>
        AddPoolLog(new PoolLog
        {
            Ph = ph,
            Chlorine = chlorine,
            Backwash = backwash,
            Cleaned = cleaned,
            Notes = Analytics.EncodeNotes(temperature, notes.Trim()),
            By = by,
        });
}
