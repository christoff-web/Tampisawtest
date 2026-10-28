using Tampisaw.Models;

namespace Tampisaw.Services;

public sealed partial class AppStore
{
    /// <summary>Removes a staff account (the roster entry, not the sign-in user). The last active admin staff account cannot be removed.</summary>
    public OpResult DeleteStaff(string id, string by)
    {
        var result = OpResult.Fail("Staff account not found.");
        EditCore(s =>
        {
            var m = s.Staff.FirstOrDefault(x => x.Id == id);
            if (m is null) return 0;
            if (m.Role == StaffRole.Admin && m.Active && s.Staff.Count(x => x.Role == StaffRole.Admin && x.Active) <= 1)
            {
                result = OpResult.Fail("The last active admin account cannot be deleted.");
                return 0;
            }
            s.Staff = s.Staff.Where(x => x.Id != id).ToList();
            Push(s, Audit($"Deleted staff account: {m.Name}", null, by));
            result = OpResult.Success;
            return 0;
        });
        return result;
    }

    /// <summary>Upserts a cottage or room and writes an audit entry.</summary>
    public void SaveCottage(Cottage cottage, string by, bool isNew)
    {
        UpdateCottage(cottage);
        Log($"{(isNew ? "Added" : "Updated")} {(cottage.Kind == CottageKind.Room ? "resort room" : cottage.Kind)}: {cottage.Name}", null, by);
    }

    /// <summary>Updates a slot's capacity or active flag and writes an audit entry.</summary>
    public void SaveSlot(Slot slot, string by, string detail)
    {
        UpdateSlot(slot);
        Log($"Updated slot {slot.Label}: {detail}", null, by);
    }
}
