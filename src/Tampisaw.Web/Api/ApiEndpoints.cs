using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Json;
using Tampisaw.Models;
using Tampisaw.Services;

namespace Tampisaw.Api;

public static class ApiEndpoints
{
    private sealed record LoginBody(string? Email, string? Password);
    private sealed record RegisterBody(string? Name, string? Email, string? Phone, string? Password, string? Birthdate);
    private sealed record ForgotBody(string? Email);
    private sealed record ResetBody(string? Email, string? Code, string? Password);
    private sealed record ChangePasswordBody(string? Current, string? Password);

    // Too many wrong passwords for one e-mail: wait a minute before trying again.
    private static readonly ConcurrentDictionary<string, (int Fails, DateTime Since)> Failures = new();
    private const int MaxFails = 6;
    private static readonly TimeSpan LockFor = TimeSpan.FromMinutes(1);

    public static void MapTampisawApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", (AppStore store) =>
        {
            var db = store.DatabaseInfo;
            return Results.Ok(new { ok = db.Connected, database = db.Summary });
        });

        api.MapGet("/state", (HttpContext http, AppStore store) => Results.Json(Envelope(http, store), ApiJson.Options));

        api.MapPost("/auth/login", async (HttpContext http, AppStore store, LoginBody body) =>
        {
            var email = (body.Email ?? "").Trim().ToLowerInvariant();
            if (email.Length == 0 || string.IsNullOrEmpty(body.Password))
                return Results.Json(new { ok = false, error = "Enter your email and password." }, ApiJson.Options);
            if (Failures.TryGetValue(email, out var f) && f.Fails >= MaxFails && DateTime.UtcNow - f.Since < LockFor)
                return Results.Json(new { ok = false, error = "Too many attempts. Please wait a minute and try again." }, ApiJson.Options, statusCode: 429);

            var result = store.Authenticate(email, body.Password);
            if (!result.Ok || result.User is null)
            {
                Failures.AddOrUpdate(email, _ => (1, DateTime.UtcNow), (_, old) => (old.Fails + 1, old.Fails >= MaxFails && DateTime.UtcNow - old.Since >= LockFor ? DateTime.UtcNow : old.Since));
                return Results.Json(new { ok = false, error = result.Error ?? "Access denied: wrong email or password." }, ApiJson.Options);
            }
            Failures.TryRemove(email, out _);
            await SignIn(http, result.User);
            return Results.Json(new { ok = true, user = ToPublic(result.User) }, ApiJson.Options);
        });

        api.MapPost("/auth/register", (AppStore store, RegisterBody body) =>
        {
            var name = Ops.LettersOnly(body.Name ?? "").Trim();
            if (!Ops.IsValidName(name))
                return Results.Json(new { ok = false, error = "Enter your full name using letters only." }, ApiJson.Options);
            var result = store.RegisterGuest(name, body.Email ?? "", body.Phone ?? "", body.Password ?? "", body.Birthdate);
            if (!result.Ok || result.User is null)
                return Results.Json(new { ok = false, error = result.Error }, ApiJson.Options);
            // Like the original screen flow: the new guest is sent to the login page, not signed in automatically.
            return Results.Json(new { ok = true, user = ToPublic(result.User) }, ApiJson.Options);
        });

        // Forgot password: always answers the same way, so nobody can test which e-mails are registered.
        api.MapPost("/auth/forgot", async (AppStore store, IEmailSender mail, HttpContext http, ForgotBody body) =>
        {
            var email = (body.Email ?? "").Trim();
            var ip = http.Connection.RemoteIpAddress?.ToString() ?? "?";
            if (Ops.IsValidEmail(email) && Throttle($"forgot:{ip}", 10, TimeSpan.FromMinutes(10)) && store.BeginPasswordReset(email) is { } r)
            {
                try
                {
                    await mail.SendAsync(r.User.Email, "Your Tampisaw password reset code",
                        $"Hello {r.User.Name},\n\nYour one-time code is {r.Code}. It works for 15 minutes.\nIf you did not ask for this, ignore this message; your password has not changed.\n\nGolden Pyramid Swimming Pool");
                }
                catch (Exception ex) { http.RequestServices.GetRequiredService<ILogger<AppStore>>().LogError(ex, "Could not send the reset e-mail"); }
            }
            return Results.Json(new { ok = true, message = "If that e-mail belongs to an account, a 6-digit code has been sent to it." }, ApiJson.Options);
        });

        api.MapPost("/auth/reset", (AppStore store, HttpContext http, ResetBody body) =>
        {
            var ip = http.Connection.RemoteIpAddress?.ToString() ?? "?";
            if (!Throttle($"reset:{ip}", 20, TimeSpan.FromMinutes(10)))
                return Results.Json(new { ok = false, error = "Too many attempts. Please wait a few minutes and try again." }, ApiJson.Options, statusCode: 429);
            var r = store.CompletePasswordReset(body.Email ?? "", body.Code ?? "", body.Password ?? "");
            return Results.Json(new { ok = r.Ok, error = r.Error }, ApiJson.Options);
        });

        api.MapPost("/auth/change-password", (HttpContext http, AppStore store, ChangePasswordBody body) =>
        {
            var actor = ActorOf(http, store);
            if (actor is null) return Results.Json(new { ok = false, error = "Please log in to continue." }, ApiJson.Options, statusCode: 401);
            var r = store.ChangeOwnPassword(actor.UserId, body.Current ?? "", body.Password ?? "");
            return Results.Json(new { ok = r.Ok, error = r.Error }, ApiJson.Options);
        });

        api.MapPost("/auth/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok(new { ok = true });
        });

        api.MapPost("/dispatch", async (HttpContext http, AppStore store, ActionDispatcher dispatcher, JsonElement action) =>
        {
            var actor = ActorOf(http, store);
            var result = dispatcher.Handle(actor, action);
            // Deleting your own account ends your session.
            if (result.Ok && actor is { IsGuest: true } && store.FindUser(actor.UserId) is null)
                await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            var env = Envelope(http, store, result.Ok && actor is { IsGuest: true } && store.FindUser(actor.UserId) is null);
            return Results.Json(new { ok = result.Ok, error = result.Error, bookingId = result.BookingId, state = env.State, user = env.User }, ApiJson.Options,
                statusCode: result.Ok ? 200 : result.Status is 401 or 403 ? result.Status : 200);
        });
    }

    // ---------------------------------------------------------------- session helpers

    private sealed record StateEnvelope(Snapshot State, PublicUser? User);

    private static StateEnvelope Envelope(HttpContext http, AppStore store, bool anonymous = false)
    {
        var actor = anonymous ? null : ActorOf(http, store);
        var user = actor is null ? null : store.FindUser(actor.UserId);
        return new StateEnvelope(store.Read(s => SnapshotBuilder.Build(s, actor)), user is null ? null : ToPublic(user));
    }

    /// <summary>The signed-in user, re-read from the database on every request so a deleted or changed account takes effect at once.</summary>
    public static Actor? ActorOf(HttpContext http, AppStore store)
    {
        var id = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(id)) return null;
        var user = store.FindUser(id);
        // Archived accounts and sessions that started before the last password change are signed out at once.
        if (user is null || user.Archived || http.User.FindFirstValue(StampClaim) != Stamp(user)) return null;
        return new Actor(user.Id, user.Role, user.Name, user.GuestId);
    }

    private const string StampClaim = "pwd-stamp";
    private static string Stamp(User u) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(u.PasswordHash)))[..16];

    private static readonly ConcurrentDictionary<string, List<DateTime>> Hits = new();

    /// <summary>True while the key has made fewer than `max` calls in the window (simple in-memory rate limit).</summary>
    private static bool Throttle(string key, int max, TimeSpan window)
    {
        var list = Hits.GetOrAdd(key, _ => []);
        lock (list)
        {
            list.RemoveAll(t => DateTime.UtcNow - t > window);
            if (list.Count >= max) return false;
            list.Add(DateTime.UtcNow);
            return true;
        }
    }

    private static PublicUser ToPublic(User u) => new()
    {
        Id = u.Id,
        Name = u.Name,
        Email = u.Email,
        Phone = u.Phone,
        Role = u.Role,
        GuestId = u.GuestId,
        Birthdate = u.Birthdate,
        Archived = u.Archived,
        CreatedAt = u.CreatedAt,
        CreatedBy = u.CreatedBy,
    };

    private static Task SignIn(HttpContext http, User user)
    {
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Role, user.Role), new Claim(StampClaim, Stamp(user))],
            CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = false });
    }
}
