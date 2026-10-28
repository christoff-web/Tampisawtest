namespace Tampisaw.Models;

public class Slot
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Time { get; set; } = "";
    public int Capacity { get; set; }
    public bool Active { get; set; } = true;
}

public class Cottage
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Capacity { get; set; }
    public int Price { get; set; }
    /// <summary>CottageStatus constant.</summary>
    public string Status { get; set; } = CottageStatus.Available;
    public string Image { get; set; } = "";
    public List<string> Amenities { get; set; } = [];
    /// <summary>CottageKind constant.</summary>
    public string Kind { get; set; } = CottageKind.Cottage;
    /// <summary>Number of identical units; null means 1.</summary>
    public int? Units { get; set; }
}

public class Addon
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int Price { get; set; }
    public string Unit { get; set; } = "";
    public int DailyCap { get; set; }
    public int Deposit { get; set; }
    public string Image { get; set; } = "";
    public bool Active { get; set; } = true;
}

public class Policy
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
}

public class Blackout
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string? SlotId { get; set; }
    public string Reason { get; set; } = "";
    /// <summary>BlackoutKind constant.</summary>
    public string? Kind { get; set; }
}
