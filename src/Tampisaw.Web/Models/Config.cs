namespace Tampisaw.Models;

/// <summary>Three numbers keyed by session tier ("day" | "night" | "overnight").</summary>
public class TierAmounts
{
    public int Day { get; set; }
    public int Night { get; set; }
    public int Overnight { get; set; }

    public int this[string tier]
    {
        get => tier switch
        {
            SessionTier.Day => Day,
            SessionTier.Night => Night,
            SessionTier.Overnight => Overnight,
            _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown session tier"),
        };
        set
        {
            switch (tier)
            {
                case SessionTier.Day: Day = value; break;
                case SessionTier.Night: Night = value; break;
                case SessionTier.Overnight: Overnight = value; break;
                default: throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown session tier");
            }
        }
    }
}

/// <summary>Admission rate per guest kind for every session tier. Reuses GuestMix as a 4-number record.</summary>
public class RateTable
{
    public GuestMix Day { get; set; } = new();
    public GuestMix Night { get; set; } = new();
    public GuestMix Overnight { get; set; } = new();

    public GuestMix this[string tier] => tier switch
    {
        SessionTier.Day => Day,
        SessionTier.Night => Night,
        SessionTier.Overnight => Overnight,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown session tier"),
    };
}

public class OvertimeRates
{
    public TierAmounts PerGuestHour { get; set; } = new();
    public TierAmounts PerCottageHour { get; set; } = new();
    public int GraceMinutes { get; set; }
    public int BlockMinutes { get; set; }
}

public class DurationCaps
{
    public int DayCottage { get; set; }
    public int NightCottage { get; set; }
}

public class Tariff
{
    public RateTable Rates { get; set; } = new();
    public int StatutoryDiscountPct { get; set; }
    public OvertimeRates Overtime { get; set; } = new();
    public DurationCaps DurationCapHours { get; set; } = new();
    public int ExpiryAlertMinutes { get; set; }
}

public class OpsConfig
{
    public int GuestsPerLifeguard { get; set; }
    public int MinLifeguardsPerShift { get; set; }
}

public class RiskRules
{
    public int PreviousNoShow { get; set; }
    public int PreviousCancellation { get; set; }
    public int LateBooking { get; set; }
    public int NoConfirmation { get; set; }
    public int LargeGroup { get; set; }
    public int MediumFrom { get; set; }
    public int HighFrom { get; set; }
}

public class HoldHours
{
    public int CottageHours { get; set; }
    public int PoolHours { get; set; }
}

public class HoldSettings
{
    public HoldHours Regular { get; set; } = new();
    public HoldHours Peak { get; set; } = new();
}

public class SocialLink
{
    public string Platform { get; set; } = "facebook";
    public string Label { get; set; } = "";
    public string Url { get; set; } = "";
    public bool Active { get; set; } = true;
}

public class ResortContact
{
    public string ResortName { get; set; } = "Golden Pyramid Pavillion and Resort";
    public string FacebookName { get; set; } = "Golden Pyramid Pavillion and Resort";
    public string FacebookUrl { get; set; } = "https://www.facebook.com/GoldenPyramidPavillionandResort";
    public string Phone { get; set; } = "09691219930";
    public string Email { get; set; } = "Goldenpyramidresort@gmail.com";
    public string InstagramUrl { get; set; } = "";
    public string TikTokUrl { get; set; } = "";
    public List<SocialLink> SocialLinks { get; set; } = [];
}

public class Settings
{
    public bool PeakSeason { get; set; }
    public HoldSettings Hold { get; set; } = new();
    public int OnlinePaymentMinutes { get; set; }
    public int ConfirmationHours { get; set; }
    public int CancellationHours { get; set; }
    public int DownpaymentPct { get; set; }
    public RiskRules RiskRules { get; set; } = new();
    public ResortContact Contact { get; set; } = new();
}
