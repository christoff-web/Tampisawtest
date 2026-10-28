using System.Collections.Concurrent;
using System.Security.Cryptography;
using Tampisaw.Models;

namespace Tampisaw.Services;

/*
 *  Accounts, roles and password recovery (AppStore.Accounts.cs)
 *  EnsureRootAdmin(RootAdminOptions)                       makes sure one Root Admin exists (start-up)
 *  CreateStaffUser / UpdateStaffUser                       Root Admin only: receptionist and admin accounts
 *  SetUserArchived / DeleteStaffUser                       Root Admin only: archive (blocks sign-in) or delete
 *  SetUserPassword                                         Root Admin sets a new password for another account
 *  ChangeOwnPassword                                       any signed-in user
 *  BeginPasswordReset / CompletePasswordReset              "Forgot password": one-time code sent to the e-mail on file
 */

/// <summary>Where the Root Admin account comes from. Password and ResetPassword are normally set with an environment variable or user-secrets, never committed.</summary>
public sealed record RootAdminOptions(string Name = "Root Administrator", string Email = "root@goldenpyramid.ph", string? Password = null, string? ResetPassword = null);

public sealed partial class AppStore
{
    public const string SystemActor = "System";

    /// <summary>The person whose request is running right now (set by the dispatcher), so audit entries carry their real name and role.</summary>
    [ThreadStatic] private static (string Name, string Role)? _actor;

    public static IDisposable ActAs(string name, string role)
    {
        var previous = _actor;
        _actor = (name, role);
        return new Scope(() => _actor = previous);
    }

    private sealed class Scope(Action onDispose) : IDisposable
    {
        public void Dispose() => onDispose();
    }

    /// <summary>Messages the host should show once at start-up (for example a generated Root Admin password).</summary>
    public List<string> StartupNotices { get; } = [];

    // ------------------------------------------------------------ root admin

    private void EnsureRootAdmin(RootAdminOptions o)
    {
        var email = (o.Email ?? "").Trim().ToLowerInvariant();
        lock (_gate)
        {
            var root = _state.Users.FirstOrDefault(u => u.Role == Roles.RootAdmin);
            if (root is null)
            {
                if (!Ops.IsValidEmail(email)) throw new InvalidOperationException("RootAdmin:Email in appsettings.json is not a valid e-mail address.");
                if (_state.Users.Any(u => u.Email.Equals(email, StringComparison.OrdinalIgnoreCase)))
                    throw new InvalidOperationException($"RootAdmin:Email ({email}) already belongs to another account. Set RootAdmin:Email to an unused address.");
                string password;
                var generated = string.IsNullOrWhiteSpace(o.Password);
                if (generated) password = GeneratePassword();
                else if (PasswordPolicy.Error(o.Password) is { } weak) throw new InvalidOperationException("RootAdmin:Password is not allowed. " + weak);
                else password = o.Password!;
                root = new User
                {
                    Id = "u-root",
                    Name = string.IsNullOrWhiteSpace(o.Name) ? "Root Administrator" : o.Name.Trim(),
                    Email = email,
                    Phone = "",
                    PasswordHash = PasswordHasher.Hash(password),
                    Role = Roles.RootAdmin,
                    CreatedAt = Ops.NowIso(),
                    CreatedBy = "System",
                };
                _state.Users = [.. _state.Users, root];
                Push(_state, Audit($"Root admin account created: {email}"));
                _persistence?.Save(_state);
                StartupNotices.Add(generated
                    ? $"ROOT ADMIN CREATED. Sign in with {email} and the one-time password {password}  - change it after the first login. (This password is shown only once; to choose your own, set RootAdmin:Password.)"
                    : $"ROOT ADMIN CREATED for {email} with the password from RootAdmin:Password.");
            }
            else if (!string.IsNullOrWhiteSpace(o.ResetPassword))
            {
                if (PasswordPolicy.Error(o.ResetPassword) is { } weak)
                    throw new InvalidOperationException("RootAdmin:ResetPassword is not allowed. " + weak);
                root.PasswordHash = PasswordHasher.Hash(o.ResetPassword!);
                Push(_state, Audit($"Root admin password reset from server configuration ({root.Email})"));
                _persistence?.Save(_state);
                StartupNotices.Add($"Root admin password for {root.Email} was reset from RootAdmin:ResetPassword. Remove that setting now.");
            }

            // Accounts that still use a published demo password are a risk: say so loudly, but never lock anyone out silently.
            foreach (var u in _state.Users.Where(u => DemoEmails.Contains(u.Email, StringComparer.OrdinalIgnoreCase)))
            {
                if (DemoPasswords.Any(p => PasswordHasher.Verify(p, u.PasswordHash)))
                    StartupNotices.Add($"SECURITY: {u.Email} still uses a demo password from the old README. Sign in as root admin and reset or archive it.");
            }
        }
    }

    private static readonly string[] DemoPasswords = ["guest123", "staff123", "admin123"];
    private static readonly string[] DemoEmails = ["mika@example.com", "reception@goldenpyramid.ph", "admin@goldenpyramid.ph"];

    private static string GeneratePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnopqrstuvwxyz", digits = "23456789", special = "!@#$%&*?";
        var all = upper + lower + digits + special;
        var chars = new List<char> { Pick(upper), Pick(lower), Pick(digits), Pick(special) };
        while (chars.Count < 16) chars.Add(Pick(all));
        // Fisher-Yates shuffle so the guaranteed characters are not always first.
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }
        return new string(chars.ToArray());
        static char Pick(string set) => set[RandomNumberGenerator.GetInt32(set.Length)];
    }

    // ------------------------------------------------------------ staff accounts (Root Admin only; the dispatcher checks the role)

    private static string? ValidateStaffFields(string name, string email, string phone, string role, out string cleanName, out string cleanEmail, out string cleanPhone)
    {
        cleanName = Ops.LettersOnly(name ?? "").Trim();
        cleanEmail = (email ?? "").Trim().ToLowerInvariant();
        cleanPhone = Ops.CanonicalPhone(phone) ?? "";
        if (!Ops.IsValidName(cleanName)) return "Enter the full name using letters only.";
        if (!Ops.IsValidEmail(cleanEmail)) return "Enter a valid e-mail address.";
        if (cleanPhone.Length == 0) return "Enter a valid mobile number: 09XXXXXXXXX or +639XXXXXXXXX.";
        if (!Roles.Managed.Contains(role)) return "Choose Receptionist or Admin.";
        return null;
    }

    public OpResult CreateStaffUser(string name, string email, string phone, string role, string password, string by)
    {
        if (ValidateStaffFields(name, email, phone, role, out var n, out var e, out var p) is { } bad) return OpResult.Fail(bad);
        if (PasswordPolicy.Error(password) is { } weak) return OpResult.Fail(weak);
        var result = OpResult.Success;
        EditCore(s =>
        {
            if (s.Users.Any(u => u.Email.Equals(e, StringComparison.OrdinalIgnoreCase))) { result = OpResult.Fail("An account with that e-mail address already exists."); return 0; }
            if (s.Users.Any(u => Roles.Staff.Contains(u.Role) && u.Phone == p)) { result = OpResult.Fail("A staff account with that contact number already exists."); return 0; }
            s.Users = [.. s.Users, new User
            {
                Id = $"u-{NewId("staff")}", Name = n, Email = e, Phone = p, Role = role,
                PasswordHash = PasswordHasher.Hash(password), CreatedAt = Ops.NowIso(), CreatedBy = by,
            }];
            Push(s, Audit($"Created {role} account: {n} ({e}, {p})", null, by));
            return 0;
        });
        return result;
    }

    public OpResult UpdateStaffUser(string id, string name, string email, string phone, string role, string by)
    {
        if (ValidateStaffFields(name, email, phone, role, out var n, out var e, out var p) is { } bad) return OpResult.Fail(bad);
        var result = OpResult.Success;
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == id);
            if (u is null) { result = OpResult.Fail("Account not found."); return 0; }
            if (!Roles.Managed.Contains(u.Role)) { result = OpResult.Fail("Only receptionist and admin accounts can be edited here."); return 0; }
            if (s.Users.Any(x => x.Id != id && x.Email.Equals(e, StringComparison.OrdinalIgnoreCase))) { result = OpResult.Fail("Another account already uses that e-mail address."); return 0; }
            if (s.Users.Any(x => x.Id != id && Roles.Staff.Contains(x.Role) && x.Phone == p)) { result = OpResult.Fail("Another staff account already uses that contact number."); return 0; }
            var changes = new List<string>();
            if (u.Name != n) changes.Add($"name {u.Name} -> {n}");
            if (!u.Email.Equals(e, StringComparison.OrdinalIgnoreCase)) changes.Add($"e-mail {u.Email} -> {e}");
            if (u.Phone != p) changes.Add($"contact {u.Phone} -> {p}");
            if (u.Role != role) changes.Add($"role {u.Role} -> {role}");
            u.Name = n; u.Email = e; u.Phone = p; u.Role = role;
            Push(s, Audit($"Updated account {n}: {(changes.Count == 0 ? "no changes" : string.Join("; ", changes))}", null, by));
            return 0;
        });
        return result;
    }

    public OpResult SetUserArchived(string id, bool archived, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == id);
            if (u is null) { result = OpResult.Fail("Account not found."); return 0; }
            if (!Roles.Managed.Contains(u.Role)) { result = OpResult.Fail("Only receptionist and admin accounts can be archived."); return 0; }
            u.Archived = archived;
            Push(s, Audit($"{(archived ? "Archived" : "Restored")} {u.Role} account: {u.Name} ({u.Email})", null, by));
            return 0;
        });
        return result;
    }

    /// <summary>Removes a receptionist or admin login. Their name stays on the audit history they created.</summary>
    public OpResult DeleteStaffUser(string id, string by)
    {
        var result = OpResult.Success;
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == id);
            if (u is null) { result = OpResult.Fail("Account not found."); return 0; }
            if (!Roles.Managed.Contains(u.Role)) { result = OpResult.Fail("Only receptionist and admin accounts can be deleted here. The root admin account cannot be deleted."); return 0; }
            s.Users = s.Users.Where(x => x.Id != id).ToList();
            Push(s, Audit($"Deleted {u.Role} account: {u.Name} ({u.Email})", null, by));
            return 0;
        });
        return result;
    }

    /// <summary>Root Admin sets a new password for a guest, receptionist or admin (never for another root admin).</summary>
    public OpResult SetUserPassword(string id, string password, string by)
    {
        if (PasswordPolicy.Error(password) is { } weak) return OpResult.Fail(weak);
        var result = OpResult.Success;
        EditCore(s =>
        {
            var u = s.Users.FirstOrDefault(x => x.Id == id);
            if (u is null) { result = OpResult.Fail("Account not found."); return 0; }
            if (u.Role == Roles.RootAdmin) { result = OpResult.Fail("The root admin password cannot be changed from here."); return 0; }
            u.PasswordHash = PasswordHasher.Hash(password);
            Push(s, Audit($"Set a new password for {u.Role} account: {u.Name} ({u.Email})", null, by));
            return 0;
        });
        return result;
    }

    public OpResult ChangeOwnPassword(string userId, string current, string password)
    {
        var u = FindUser(userId);
        if (u is null) return OpResult.Fail("Please log in again.");
        if (!PasswordHasher.Verify(current ?? "", u.PasswordHash)) return OpResult.Fail("Your current password is not correct.");
        if (PasswordPolicy.Error(password) is { } weak) return OpResult.Fail(weak);
        if (PasswordHasher.Verify(password, u.PasswordHash)) return OpResult.Fail("Choose a password you have not used before.");
        EditCore(s =>
        {
            var x = s.Users.First(y => y.Id == userId);
            x.PasswordHash = PasswordHasher.Hash(password);
            Push(s, Audit("Changed own password", null, x.Name));
            if (x.GuestId is not null) Push(s, MakeNotice(NoticeAudience.Guest, "Account update: your password was changed. If this was not you, reset it now and contact the resort.", x.GuestId, null));
            return 0;
        });
        return OpResult.Success;
    }

    // ------------------------------------------------------------ forgot password (all account types)

    private sealed record ResetCode(string Hash, string Salt, DateTime Expires, DateTime Issued, int Attempts);

    private readonly ConcurrentDictionary<string, ResetCode> _resets = new();
    private static readonly TimeSpan ResetLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ResetCooldown = TimeSpan.FromSeconds(60);
    private const int MaxResetAttempts = 5;

    private static string HashCode(string code, string salt) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(salt + ":" + code)));

    /// <summary>
    /// Creates a one-time 6-digit code for the account with this e-mail. Returns the user and the code so the caller can mail it,
    /// or null when there is nothing to send (unknown e-mail, archived account, or a code was just sent). The caller must answer
    /// the browser the same way in every case so nobody can find out which e-mails are registered.
    /// </summary>
    public (User User, string Code)? BeginPasswordReset(string email)
    {
        var clean = (email ?? "").Trim();
        var user = Read(s => s.Users.FirstOrDefault(u => u.Email.Equals(clean, StringComparison.OrdinalIgnoreCase)));
        if (user is null || user.Archived) return null;
        if (_resets.TryGetValue(user.Id, out var old) && DateTime.UtcNow - old.Issued < ResetCooldown) return null;
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(8));
        _resets[user.Id] = new ResetCode(HashCode(code, salt), salt, DateTime.UtcNow + ResetLifetime, DateTime.UtcNow, 0);
        Log($"Password reset code requested for {user.Role} account {user.Email}", null, SystemActor);
        return (user, code);
    }

    public OpResult CompletePasswordReset(string email, string code, string password)
    {
        const string generic = "That code is not valid or has expired. Request a new one.";
        var clean = (email ?? "").Trim();
        var user = Read(s => s.Users.FirstOrDefault(u => u.Email.Equals(clean, StringComparison.OrdinalIgnoreCase)));
        if (user is null || user.Archived || !_resets.TryGetValue(user.Id, out var entry)) return OpResult.Fail(generic);
        if (entry.Expires < DateTime.UtcNow || entry.Attempts >= MaxResetAttempts) { _resets.TryRemove(user.Id, out _); return OpResult.Fail(generic); }
        var ok = CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(HashCode((code ?? "").Trim(), entry.Salt)),
            System.Text.Encoding.UTF8.GetBytes(entry.Hash));
        if (!ok)
        {
            _resets[user.Id] = entry with { Attempts = entry.Attempts + 1 };
            return OpResult.Fail(generic);
        }
        if (PasswordPolicy.Error(password) is { } weak) return OpResult.Fail(weak);   // the code stays valid so they can try a stronger password
        _resets.TryRemove(user.Id, out _);
        EditCore(s =>
        {
            var u = s.Users.First(x => x.Id == user.Id);
            u.PasswordHash = PasswordHasher.Hash(password);
            Push(s, Audit($"Password reset completed for {u.Role} account {u.Email}", null, SystemActor));
            if (u.GuestId is not null) Push(s, MakeNotice(NoticeAudience.Guest, "Account update: your password was reset. If this was not you, contact the resort right away.", u.GuestId, null));
            return 0;
        });
        return OpResult.Success;
    }
}
