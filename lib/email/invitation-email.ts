import { resend } from "@/lib/email/resend";

interface SendInvitationEmailInput {
  to: string;
  inviteeName: string;
  websiteName: string;
  roleName: string;
  invitationUrl: string;
  expiresAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRoleName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function sendInvitationEmail({
  to,
  inviteeName,
  websiteName,
  roleName,
  invitationUrl,
  expiresAt,
}: SendInvitationEmailInput) {
  const from = process.env.RESEND_FROM_EMAIL ?? "Veyra <onboarding@resend.dev>";

  const safeName = escapeHtml(inviteeName);
  const safeWebsite = escapeHtml(websiteName);
  const safeRole = escapeHtml(formatRoleName(roleName));
  const safeUrl = escapeHtml(invitationUrl);

  const expires = expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: `Invitation to join ${websiteName}`,
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717;">
          <table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
                  <tr>
                    <td style="padding:32px;">
                      <h1 style="margin:0 0 16px;font-size:24px;">
                        You're invited
                      </h1>

                      <p style="margin:0 0 16px;line-height:1.6;">
                        Hi ${safeName},
                      </p>

                      <p style="margin:0 0 16px;line-height:1.6;">
                        You have been invited to join
                        <strong>${safeWebsite}</strong>
                        as <strong>${safeRole}</strong>.
                      </p>

                      <table cellspacing="0" cellpadding="0" style="margin:24px 0;">
                        <tr>
                          <td style="background:#d6a400;border-radius:8px;">
                            <a
                              href="${safeUrl}"
                              style="display:inline-block;padding:12px 20px;color:#111111;text-decoration:none;font-weight:600;"
                            >
                              Accept invitation
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0 0 8px;font-size:14px;color:#737373;line-height:1.6;">
                        This invitation expires on ${escapeHtml(expires)} UTC.
                      </p>

                      <p style="margin:0;font-size:14px;color:#737373;line-height:1.6;">
                        If you were not expecting this invitation, you can ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Unable to send invitation email: ${error.message}`);
  }

  return data;
}
