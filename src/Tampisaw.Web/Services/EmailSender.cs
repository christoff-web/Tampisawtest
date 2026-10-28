using System.Net;
using System.Net.Mail;

namespace Tampisaw.Services;

/// <summary>Sends the one-time password reset code. Real mail needs the Smtp section of appsettings (see README).</summary>
public interface IEmailSender
{
    /// <summary>True when mail really leaves the server (an SMTP host is configured).</summary>
    bool IsConfigured { get; }

    Task SendAsync(string to, string subject, string body);
}

public sealed record SmtpOptions(string? Host, int Port, string? User, string? Password, string From, bool EnableSsl)
{
    public static SmtpOptions From_(IConfiguration c) => new(
        c["Smtp:Host"],
        int.TryParse(c["Smtp:Port"], out var port) ? port : 587,
        c["Smtp:User"],
        c["Smtp:Password"],
        string.IsNullOrWhiteSpace(c["Smtp:From"]) ? "no-reply@goldenpyramid.ph" : c["Smtp:From"]!,
        !bool.TryParse(c["Smtp:EnableSsl"], out var ssl) || ssl);
}

/// <summary>
/// Mail through the configured SMTP server. When no server is configured the message is written to the application log
/// instead, so a local installation without a mail server can still complete a reset (the operator reads the code from
/// the console). That fallback is for local use only: configure SMTP before the system is used by real guests.
/// </summary>
public sealed class SmtpEmailSender(SmtpOptions options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Host);

    public async Task SendAsync(string to, string subject, string body)
    {
        if (!IsConfigured)
        {
            log.LogWarning("SMTP is not configured, so this e-mail was NOT sent. To: {To} | {Subject} | {Body}", to, subject, body);
            return;
        }
        using var client = new SmtpClient(options.Host!, options.Port) { EnableSsl = options.EnableSsl };
        if (!string.IsNullOrWhiteSpace(options.User)) client.Credentials = new NetworkCredential(options.User, options.Password);
        using var message = new MailMessage(options.From, to, subject, body);
        await client.SendMailAsync(message);
    }
}
