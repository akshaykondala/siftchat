import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "siftchat <hello@siftchat.xyz>";
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
    subject: `${inviterName} invited you to plan a trip`,
    text: `Hey! ${inviterName} invited you to help plan "${tripName}" on siftchat.\n\nJoin here: ${joinUrl}\n\nYou received this because someone shared a trip invite with you.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 32px 24px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
              <tr><td align="center">
                <svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="pipbg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#a78bfa"/>
                      <stop offset="100%" stop-color="#6366f1"/>
                    </linearGradient>
                  </defs>
                  <rect width="56" height="56" rx="14" fill="url(#pipbg)"/>
                  <circle cx="16" cy="24" r="7" fill="white"/>
                  <circle cx="40" cy="24" r="7" fill="white"/>
                  <circle cx="17" cy="25" r="4" fill="#312e81"/>
                  <circle cx="41" cy="25" r="4" fill="#312e81"/>
                  <circle cx="19" cy="22" r="1.5" fill="white"/>
                  <circle cx="43" cy="22" r="1.5" fill="white"/>
                  <ellipse cx="8" cy="33" rx="5" ry="3" fill="#f9a8d4" opacity="0.5"/>
                  <ellipse cx="48" cy="33" rx="5" ry="3" fill="#f9a8d4" opacity="0.5"/>
                  <path d="M18 40 Q28 47 38 40" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round" fill="none"/>
                </svg>
              </td></tr>
            </table>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:900;letter-spacing:-0.5px;">siftchat</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">You're invited</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              <strong style="color:#111827;">${inviterName}</strong> wants you to help plan
              <strong style="color:#111827;">${tripName}</strong>.
            </p>

            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Chat with the crew, vote on plans, and sort out flights and lodging — all in one place.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${joinUrl}"
                     style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;letter-spacing:-0.2px;">
                    Join the trip
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
              siftchat.xyz &middot; You received this because ${inviterName} shared a trip invite with you.
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
