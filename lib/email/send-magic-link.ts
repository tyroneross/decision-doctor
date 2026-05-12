// Magic-link email delivery for Better Auth's magicLink plugin.
// Pattern from build-loop:authentication skill (atomize-ai reference).
// Dev: prints to terminal. Prod: hard-fails on missing key, sends via Resend.

import "server-only";
import { env } from "@/lib/env";

interface SendMagicLinkParams {
  email: string;
  url: string;
}

export async function sendMagicLinkEmail({
  email,
  url,
}: SendMagicLinkParams): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const hasProvider = Boolean(env.RESEND_API_KEY);

  if (!hasProvider) {
    if (isProd) {
      throw new Error(
        "[auth] sendMagicLinkEmail: RESEND_API_KEY missing in production",
      );
    }
    // Dev: print the link so the developer can click it directly.
    console.log("\n" + "━".repeat(56));
    console.log("  📧 MAGIC LINK (dev mode — Resend not configured)");
    console.log(`  To:   ${email}`);
    console.log(`  Link: ${url}`);
    console.log("━".repeat(56) + "\n");
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: env.AUTH_FROM_EMAIL,
    to: email,
    subject: "Sign in to Aida",
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 20px; color: #111; margin: 0 0 12px;">Sign in to Aida</h1>
        <p style="color: #555; line-height: 1.5; margin: 0 0 20px;">Click below to sign in. This link expires in 10 minutes and can only be used once.</p>
        <a href="${url}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Sign in to Aida</a>
        <p style="color: #888; font-size: 12px; margin-top: 28px; line-height: 1.5;">If you didn't request this, you can safely ignore this email. Magic links never sign you in unless you click them.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`[auth] Resend send failed: ${error.message}`);
  }
}
