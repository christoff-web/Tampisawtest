using Microsoft.AspNetCore.Authentication.Cookies;
using Tampisaw.Api;
using Tampisaw.Data;
using Tampisaw.Services;

var builder = WebApplication.CreateBuilder(args);

// ---- Database: SQL Server by default (see appsettings.json "Database"). Every change is saved through AppStore.
#if NODB
builder.Services.AddSingleton<AppStore>(_ => new AppStore());
#else
builder.Services.AddSingleton(DatabaseOptions.From(builder.Configuration));
builder.Services.AddSingleton<IStatePersistence, DbStatePersistence>();
builder.Services.AddSingleton(new RootAdminOptions(
    builder.Configuration["RootAdmin:Name"] ?? "Root Administrator",
    builder.Configuration["RootAdmin:Email"] ?? "root@goldenpyramid.ph",
    builder.Configuration["RootAdmin:Password"],
    builder.Configuration["RootAdmin:ResetPassword"]));
builder.Services.AddSingleton<AppStore>();
#endif
builder.Services.AddSingleton(SmtpOptions.From_(builder.Configuration));
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<ActionDispatcher>();
builder.Services.AddHostedService<TickService>();

// ---- Sign-in: an HTTP-only session cookie. Passwords are stored as salted PBKDF2 hashes.
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "tampisaw.session";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromHours(10);
        o.SlidingExpiration = true;
        // The API answers 401/403 itself instead of redirecting to a login page.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = ApiJson.Options.PropertyNamingPolicy;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
    o.SerializerOptions.DefaultIgnoreCondition = ApiJson.Options.DefaultIgnoreCondition;
    o.SerializerOptions.NumberHandling = ApiJson.Options.NumberHandling;
});
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 8 * 1024 * 1024);

var app = builder.Build();

// The camera is allowed for this site only (QR check-in scanning); the microphone is never allowed.
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["Permissions-Policy"] = "camera=(self), microphone=()";
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// CSRF guard for the cookie: state-changing calls must be same-origin JSON.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") && HttpMethods.IsPost(ctx.Request.Method))
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        var okOrigin = origin.Length == 0 || Uri.TryCreate(origin, UriKind.Absolute, out var u) && u.Authority.Equals(ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase);
        var json = ctx.Request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true;
        if (!okOrigin || !json) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsync("Bad request."); return; }
    }
    await next();
});

app.MapTampisawApi();
// The React app uses #/ routes, so index.html is the only page; unknown API paths stay 404.
app.MapFallbackToFile("index.html");

// Open the database (creates/updates the tables and loads the saved data) before serving the first request.
app.Services.GetRequiredService<AppStore>();
app.Logger.LogInformation("Tampisaw: {Database}", app.Services.GetRequiredService<AppStore>().DatabaseInfo.Summary);
foreach (var notice in app.Services.GetRequiredService<AppStore>().StartupNotices) app.Logger.LogWarning("{Notice}", notice);

app.Run();

public partial class Program { }
