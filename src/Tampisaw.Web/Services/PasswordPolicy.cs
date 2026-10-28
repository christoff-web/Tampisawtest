namespace Tampisaw.Services;

/// <summary>
/// The one password rule for every account type (guest, receptionist, admin, root admin) and every place a password is
/// set: sign-up, password reset, staff account creation and password change. The browser shows the same checklist,
/// but this is the check that counts.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    /// <summary>Every rule the password does not meet, as messages the person can act on. Empty = the password is fine.</summary>
    public static List<string> Problems(string? password)
    {
        var p = password ?? "";
        var problems = new List<string>();
        if (p.Length < MinLength) problems.Add($"Use at least {MinLength} characters.");
        if (p.Length > MaxLength) problems.Add($"Use at most {MaxLength} characters.");
        if (!p.Any(char.IsUpper)) problems.Add("Add at least one uppercase letter (A-Z).");
        if (!p.Any(char.IsDigit)) problems.Add("Add at least one number (0-9).");
        if (!p.Any(c => !char.IsLetterOrDigit(c) && !char.IsWhiteSpace(c))) problems.Add("Add at least one special character, for example ! @ # $ % & *.");
        return problems;
    }

    public static bool IsValid(string? password) => Problems(password).Count == 0;

    /// <summary>One sentence for an API error, or null when the password is acceptable.</summary>
    public static string? Error(string? password)
    {
        var problems = Problems(password);
        return problems.Count == 0 ? null : "Password is too weak. " + string.Join(" ", problems);
    }
}
