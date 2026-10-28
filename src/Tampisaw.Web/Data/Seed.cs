using Tampisaw.Models;
using Tampisaw.Services;

namespace Tampisaw.Data;

/// <summary>
/// Clean-slate state: resort configuration only (policies, tariff, slots, cottages, add-ons) and no accounts and no activity.
/// Written to the database only when it is empty. The first Root Admin account is created by AppStore.EnsureRootAdmin.
/// The three demo accounts (guest, front desk, admin) exist only in the in-memory store the unit tests use
/// (includeDemoAccounts: true); a real database never receives them.
/// </summary>
public static class Seed
{
    // Hashing is deliberately slow, so the three test-only hashes are computed once per process.
    private static readonly Lazy<(string Guest, string Staff, string Admin)> Hashes =
        new(() => (PasswordHasher.Hash("guest123"), PasswordHasher.Hash("staff123"), PasswordHasher.Hash("admin123")));

    public static AppState Create(bool includeDemoAccounts = true)
    {
        var state = Build();
        if (!includeDemoAccounts)
        {
            state.Users = [];
            state.Guests = [];
            state.Staff = [];
            state.Draft = new DraftBooking { Date = NewDraft().Date, SlotId = SlotIds.DayTour, Type = BookingType.Pool, EventStart = "8:00 AM – 12:00 PM" };
        }
        return state;
    }

    private static AppState Build() => new()
    {
        Policies =
        [
            new() { Id = "pol-attire", Title = "Attire", Body = "Proper swimming attire is preferred. Plain white shirts and buttonless shorts are allowed for guests without swimwear; other street clothes are prohibited." },
            new() { Id = "pol-food", Title = "Food and drinks", Body = "Outside food, drinks, and alcoholic beverages are allowed. Alcohol is also available at the canteen. Free grilling stations are provided." },
            new() { Id = "pol-noise", Title = "Sound and stoves", Body = "Sound systems are not allowed because the resort is in a residential area. Stoves are prohibited; super kalan is allowed in the parking area only." },
            new() { Id = "pol-capacity", Title = "Capacity and closure", Body = "Walk-ins are welcome, but entrance is declined once maximum capacity is reached. The resort is closed every Tuesday for disinfection." },
        ],
        Users =
        [
            new() { Id = "u-g1", Name = "Mika Santos", Email = "mika@example.com", Phone = "09175552810", PasswordHash = Hashes.Value.Guest, Role = Roles.Guest, GuestId = "g1" },
            new() { Id = "u-rec", Name = "Carlo Reyes", Email = "reception@goldenpyramid.ph", Phone = "09170001111", PasswordHash = Hashes.Value.Staff, Role = Roles.Receptionist },
            new() { Id = "u-adm", Name = "Andrea Mendoza", Email = "admin@goldenpyramid.ph", Phone = "09170002222", PasswordHash = Hashes.Value.Admin, Role = Roles.Admin },
        ],
        Tariff = new()
        {
            Rates = new()
            {
                Day = new() { Adult = 250, Child = 180, Senior = 250, Pwd = 250 },
                Night = new() { Adult = 300, Child = 220, Senior = 300, Pwd = 300 },
                Overnight = new() { Adult = 450, Child = 320, Senior = 450, Pwd = 450 },
            },
            StatutoryDiscountPct = 20,
            Overtime = new()
            {
                PerGuestHour = new() { Day = 50, Night = 60, Overnight = 60 },
                PerCottageHour = new() { Day = 150, Night = 200, Overnight = 250 },
                GraceMinutes = 15,
                BlockMinutes = 60,
            },
            DurationCapHours = new() { DayCottage = 8, NightCottage = 8 },
            ExpiryAlertMinutes = 15,
        },
        Addons =
        [
            new() { Id = "ad-grill", Name = "Charcoal grill set", Description = "Grill, 2 kg charcoal, tongs and basting brush. Cleaned after use.", Price = 350, Unit = "per day", DailyCap = 10, Deposit = 500, Image = "/golden-pyramid/canteen.jpg", Active = true },
            new() { Id = "ad-karaoke", Name = "Karaoke machine", Description = "Two wireless mics, 15,000-song library, speaker stand. 5 units available.", Price = 1200, Unit = "per day", DailyCap = 5, Deposit = 1500, Image = "/golden-pyramid/pavilion-event-original.jpg", Active = true },
            new() { Id = "ad-table", Name = "Extra table", Description = "Folding table for 6, with a cloth cover.", Price = 150, Unit = "per day", DailyCap = 15, Deposit = 200, Image = "/golden-pyramid/canteen-tables-original.jpg", Active = true },
            new() { Id = "ad-seat", Name = "Extra chair", Description = "Stackable monobloc chair.", Price = 20, Unit = "per chair", DailyCap = 100, Deposit = 25, Image = "/golden-pyramid/cutouts/canteen-exclusive.jpg", Active = true },
        ],
        OpsConfig = new() { GuestsPerLifeguard = 40, MinLifeguardsPerShift = 2 },
        Settings = new()
        {
            PeakSeason = false,
            Hold = new()
            {
                Regular = new() { CottageHours = 24, PoolHours = 3 },
                Peak = new() { CottageHours = 12, PoolHours = 1 },
            },
            OnlinePaymentMinutes = 20,
            ConfirmationHours = 48,
            CancellationHours = 48,
            DownpaymentPct = 30,
            RiskRules = new()
            {
                PreviousNoShow = 20,
                PreviousCancellation = 10,
                LateBooking = 15,
                NoConfirmation = 20,
                LargeGroup = 10,
                MediumFrom = 40,
                HighFrom = 70,
            },
            Contact = new()
            {
                ResortName = "Golden Pyramid Pavillion and Resort",
                FacebookName = "Golden Pyramid Pavillion and Resort",
                FacebookUrl = "https://www.facebook.com/GPPResort",
                Phone = "09691219930",
                Email = "Goldenpyramidresort@gmail.com",
                InstagramUrl = "",
                TikTokUrl = "",
            },
        },
        Staff =
        [
            new() { Id = "s1", Name = "Andrea Mendoza", Role = StaffRole.Admin, Active = true },
            new() { Id = "s2", Name = "Carlo Reyes", Role = StaffRole.Gate, Active = true },
        ],
        Slots =
        [
            new() { Id = SlotIds.DayTour, Label = "Day Tour", Time = "8:00 AM – 4:00 PM", Capacity = 120, Active = true },
            new() { Id = SlotIds.NightSwim, Label = "Night Swimming", Time = "6:00 PM – 2:00 AM", Capacity = 100, Active = true },
            new() { Id = SlotIds.RoomStay, Label = "Room Accommodation", Time = "2:00 PM – 11:00 AM next day", Capacity = 36, Active = true },
            new() { Id = SlotIds.Event, Label = "Pavilion Event", Time = "Choose a 4-hour block", Capacity = 150, Active = true },
        ],
        Cottages =
        [
            new() { Id = "c1", Units = 2, Name = "Small Cabana", Capacity = 12, Price = 650, Status = CottageStatus.Available, Image = "/golden-pyramid/cutouts/cabana.jpg", Amenities = ["10–12 guests", "Open cottage", "Pool access separate"], Kind = CottageKind.Cottage },
            new() { Id = "c2", Units = 2, Name = "Big Cabana", Capacity = 20, Price = 850, Status = CottageStatus.Available, Image = "/golden-pyramid/cutouts/cabana.jpg", Amenities = ["13–20 guests", "Open cottage", "Pool access separate"], Kind = CottageKind.Cottage },
            new() { Id = "c3", Units = 4, Name = "Long Table", Capacity = 6, Price = 300, Status = CottageStatus.Available, Image = "/golden-pyramid/canteen-tables-original.jpg", Amenities = ["6 guests", "Table reservation", "Pool access separate"], Kind = CottageKind.Cottage },
            new() { Id = "c4", Name = "Canteen Exclusive", Capacity = 30, Price = 3000, Status = CottageStatus.Available, Image = "/golden-pyramid/canteen-tables-original.jpg", Amenities = ["Up to 30 guests", "Exclusive canteen area", "Tables included"], Kind = CottageKind.Cottage },
            new() { Id = "r1", Units = 2, Name = "Deluxe Room (Pool Side)", Capacity = 6, Price = 2000, Status = CottageStatus.Available, Image = "/golden-pyramid/private-room-original.jpg", Amenities = ["One twin-size bed", "Pool side", "2 PM–11 AM"], Kind = CottageKind.Room },
            new() { Id = "r2", Units = 2, Name = "Standard Room (2nd Floor)", Capacity = 6, Price = 1800, Status = CottageStatus.Available, Image = "/golden-pyramid/private-room-original.jpg", Amenities = ["One twin-size bed", "Second floor", "2 PM–11 AM"], Kind = CottageKind.Room },
            new() { Id = "r3", Units = 1, Name = "Family Room", Capacity = 6, Price = 7000, Status = CottageStatus.Available, Image = "/golden-pyramid/family-room-original.jpg", Amenities = ["Five double-deck beds", "Family accommodation", "2 PM–11 AM"], Kind = CottageKind.Room },
            new() { Id = "e1", Name = "Ground Pavilion", Capacity = 150, Price = 10500, Status = CottageStatus.Available, Image = "/golden-pyramid/pavilion-event-original.jpg", Amenities = ["100–150 guests", "4 hours", "Open air", "Tables and chairs included", "Pool not included", "Corkage applies"], Kind = CottageKind.Event },
            new() { Id = "e2", Name = "2nd Floor Pavilion", Capacity = 60, Price = 8500, Status = CottageStatus.Available, Image = "/golden-pyramid/cutouts/second-floor-pavilion.jpg", Amenities = ["50–60 guests", "4 hours", "Air-conditioned", "Tables and chairs included", "Pool not included", "Corkage applies"], Kind = CottageKind.Event },
        ],
        Guests =
        [
            new() { Id = "g1", Name = "Mika Santos", Email = "mika@example.com", Phone = "09175552810", Visits = 0, Cancellations = 0, NoShows = 0, LastVisit = "", Risk = Risk.Low },
        ],
        Draft = NewDraft(),
    };

    public static DraftBooking NewDraft() => new()
    {
        Date = DateTime.Now.AddDays(1).ToString("yyyy-MM-dd"),
        SlotId = SlotIds.DayTour,
        Guests = 0,
        Type = BookingType.Pool,
        Name = "",
        Email = "",
        Phone = "",
        Adults = 0,
        Children = 0,
        Discounts = 0,
        EventStart = "8:00 AM – 12:00 PM",
    };
}
