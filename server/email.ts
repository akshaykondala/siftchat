import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Pip from siftchat <pip@siftchat.xyz>";
const BASE_URL = process.env.APP_URL || "https://siftchat.xyz";

export async function sendTripInvite({
  toEmail,
  inviterName,
  tripName,
  slug,
}: {
  toEmail: string;
  inviterName: string;
  tripName: string;
  slug: string;
}): Promise<void> {
  const joinUrl = `${BASE_URL}/g/${slug}`;

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${inviterName} invited you to plan a trip 🌍`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 32px 24px;text-align:center;">
            <div style="width:56px;height:56px;background:#6d28d9;border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
              <svg width="56" height="56" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="28" height="28" rx="9" fill="#7c3aed"/>
                <ellipse cx="11" cy="9" rx="5" ry="3" fill="#a78bfa" opacity="0.5"/>
                <circle cx="11" cy="16" r="4" fill="white"/>
                <circle cx="21" cy="16" r="4" fill="white"/>
                <circle cx="12" cy="16" r="2" fill="#1e1b4b"/>
                <circle cx="22" cy="16" r="2" fill="#1e1b4b"/>
                <circle cx="13" cy="15" r="0.8" fill="white"/>
                <circle cx="23" cy="15" r="0.8" fill="white"/>
              </svg>
            </div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:900;letter-spacing:-0.5px;">siftchat</h1>
            <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px;">plan trips together</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">You're invited! 🎉</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              <strong style="color:#111827;">${inviterName}</strong> invited you to help plan
              <strong style="color:#111827;">${tripName}</strong> on siftchat.
            </p>

            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Chat with your crew, vote on plans, and let Pip (our AI) keep things organized — so this trip actually happens.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${joinUrl}"
                     style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;letter-spacing:-0.2px;">
                    Join the trip →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
              Or copy this link: <a href="${joinUrl}" style="color:#7c3aed;">${joinUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              Sent by Pip · siftchat.xyz · You received this because someone invited you to a trip.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  });
}
