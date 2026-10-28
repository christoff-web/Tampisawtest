namespace Tampisaw.Models;

public class DamageFee
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public string? BookingId { get; set; }
    public string Item { get; set; } = "";
    public int Amount { get; set; }
    public string Note { get; set; } = "";
    public string By { get; set; } = "";
    public bool Settled { get; set; }
}

public class Guest
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public int Visits { get; set; }
    public int Cancellations { get; set; }
    public int NoShows { get; set; }
    public List<DamageFee> DamageFees { get; set; } = [];
    public string LastVisit { get; set; } = "";
    /// <summary>Risk constant.</summary>
    public string Risk { get; set; } = Models.Risk.Low;
}

public class User
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    /// <summary>Salted PBKDF2 hash (see PasswordHasher). Never a plaintext password.</summary>
    public string PasswordHash { get; set; } = "";
    /// <summary>Roles constant.</summary>
    public string Role { get; set; } = Roles.Guest;
    public string? GuestId { get; set; }
    public string? Birthdate { get; set; }
    /// <summary>Archived accounts keep their history but can no longer sign in.</summary>
    public bool Archived { get; set; }
    /// <summary>ISO time the account was created (null for accounts that existed before this field).</summary>
    public string? CreatedAt { get; set; }
    /// <summary>Name of the person who created the account (root admin for staff accounts).</summary>
    public string? CreatedBy { get; set; }
}

public class StaffAccount
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>StaffRole constant.</summary>
    public string Role { get; set; } = StaffRole.Gate;
    public bool Active { get; set; } = true;
}

public class Lifeguard
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}

public class RosterEntry
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    /// <summary>Shift constant.</summary>
    public string Shift { get; set; } = Models.Shift.Morning;
    public string GuardId { get; set; } = "";
}
