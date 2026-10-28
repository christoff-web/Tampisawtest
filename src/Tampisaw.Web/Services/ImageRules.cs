namespace Tampisaw.Services;

/// <summary>Upload restriction for proofs of payment and face photos: JPG, JPEG or PNG only (port of lib/upload.ts).</summary>
public static class ImageRules
{
    public const string Accept = "image/png,image/jpeg,.jpg,.jpeg,.png";
    public const string ErrorMessage = "Only JPG, JPEG or PNG images are allowed.";

    /// <summary>True only when BOTH the file extension and the MIME type are jpg/jpeg/png.</summary>
    public static bool IsAllowed(string? fileName, string? contentType)
    {
        if (string.IsNullOrWhiteSpace(fileName) || string.IsNullOrWhiteSpace(contentType)) return false;
        var ext = Path.GetExtension(fileName.Trim()).ToLowerInvariant();
        var type = contentType.Trim().ToLowerInvariant();
        var okExt = ext is ".jpg" or ".jpeg" or ".png";
        var okType = type is "image/jpeg" or "image/png";
        return okExt && okType;
    }

    /// <summary>Error text for the UI, or null when the file is allowed.</summary>
    public static string? Error(string? fileName, string? contentType) => IsAllowed(fileName, contentType) ? null : ErrorMessage;
}
