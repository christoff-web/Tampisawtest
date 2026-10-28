using Tampisaw.Models;
namespace Tampisaw.Services;

/// <summary>Pure helpers shared by the incident and maintenance modules.</summary>
public static partial class Ops
{
    /// <summary>"12 min", "3h 5m" or "2d 4h".</summary>
    public static string Duration(double ms)
    {
        var m = (long)Math.Max(0, Math.Round(ms / 60_000));
        if (m < 60) return $"{m} min";
        var h = m / 60;
        if (h < 48) return $"{h}h {m % 60}m";
        return $"{h / 24}d {h % 24}h";
    }

    /// <summary>Average ms from created to resolved over resolved items, 0 when none.</summary>
    public static double AvgResolveMs(IEnumerable<(string CreatedAt, string? ResolvedAt)> items)
    {
        var d = items.Where(x => !string.IsNullOrEmpty(x.ResolvedAt))
            .Select(x => (double)(UnixMs(x.ResolvedAt!) - UnixMs(x.CreatedAt))).ToList();
        return d.Count == 0 ? 0 : d.Average();
    }

    public static string IncidentTone(string status) => status switch
    {
        IncidentStatus.Resolved => "success",
        IncidentStatus.Cancelled => "neutral",
        IncidentStatus.InProgress => "info",
        _ => "warning",
    };

    public static string MaintenanceTone(string status) => status switch
    {
        MaintenanceStatus.Done => "success",
        MaintenanceStatus.Cancelled => "neutral",
        MaintenanceStatus.OnTheWay => "info",
        _ => "warning",
    };

    /// <summary>Severity class for the list rail: high = serious/escalated, mid = urgent or open, low = closed.</summary>
    public static string SeverityClass(bool high, bool open) => high ? "so-sev-high" : open ? "so-sev-mid" : "so-sev-low";
}
