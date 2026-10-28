namespace Tampisaw.Services;

public sealed class TickService(AppStore store, ILogger<TickService> log) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { store.Tick(); }
                catch (Exception ex) { log.LogError(ex, "Tick failed"); }
            }
        }
        catch (OperationCanceledException) { }
    }
}
