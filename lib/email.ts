// PRD §9 — Resend transactional emails for magic links + verification.
// In dev (NODE_ENV !== production), if RESEND fails (e.g. unverified domain),
// the link is logged to the server console as a fallback so local sign-in still works.

import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

const resend = new Resend(env.RESEND_API_KEY);

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  try {
    const { error } = await resend.emails.send({
      from: env.AUTH_FROM_EMAIL,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[email] resend error:", error);
      if (env.NODE_ENV !== "production") {
        console.warn("[email] DEV FALLBACK — magic link logged below for manual use:");
        console.warn(text);
      }
    }
  } catch (err) {
    console.error("[email] send threw:", err);
    if (env.NODE_ENV !== "production") {
      console.warn("[email] DEV FALLBACK:");
      console.warn(text);
    }
  }
}

export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const subject = "Sign in to Decision Doctor";
  const text = `Sign in to Decision Doctor:\n\n${url}\n\nThis link expires in 1 hour.`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:auto;padding:24px">
      <h1 style="font-size:20px;color:#0f172a">Sign in to Decision Doctor</h1>
      <p style="color:#475569">Click the button below to sign in. The link expires in 1 hour.</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500">Sign in</a>
      </p>
      <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${url}</p>
    </div>
  `;
  await send(email, subject, html, text);
}

export async function sendVerificationEmail(email: string, url: string): Promise<void> {
  const subject = "Verify your Decision Doctor email";
  const text = `Verify your email for Decision Doctor:\n\n${url}\n\nThis link expires in 24 hours.`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:auto;padding:24px">
      <h1 style="font-size:20px;color:#0f172a">Verify your email</h1>
      <p style="color:#475569">Click the button below to confirm your address.</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500">Verify email</a>
      </p>
      <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${url}</p>
    </div>
  `;
  await send(email, subject, html, text);
}
