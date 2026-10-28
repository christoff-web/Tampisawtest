using Tampisaw.Models;

namespace Tampisaw.Api;

/// <summary>The signed-in person behind a request. Always built from the database user, never from what the browser sends.</summary>
public sealed record Actor(string UserId, string Role, string Name, string? GuestId)
{
    /// <summary>Administrator tools (not the root admin).</summary>
    public bool IsAdmin => Role == Roles.Admin;
    /// <summary>Only the root admin: staff accounts and the audit log, nothing else.</summary>
    public bool IsRoot => Role == Roles.RootAdmin;
    /// <summary>Front desk or admin. The root admin is not operational staff.</summary>
    public bool IsStaff => Role is Roles.Admin or Roles.Receptionist;
    public bool IsGuest => Role == Roles.Guest;
}

/// <summary>Outcome of one action. BookingId is set when the server created or renumbered a booking.</summary>
public sealed record DispatchResult(bool Ok, string? Error = null, string? BookingId = null, int Status = 200)
{
    public static DispatchResult Success(string? bookingId = null) => new(true, null, bookingId);
    public static DispatchResult Fail(string error, int status = 400) => new(false, error, null, status);
}
