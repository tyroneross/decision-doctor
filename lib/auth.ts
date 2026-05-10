import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { getDb } from "./db/actor";
import { getOrCreatePersonalTenant } from "./db/tenants";
import * as schema from "./db/schema";

export interface SessionActor {
  userId: string;
  tenantId: string;
}

let resendClient: Resend | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function baseUrl(): string {
  return requiredEnv("BETTER_AUTH_URL");
}

function authFromEmail(): string {
  return requiredEnv("AUTH_FROM_EMAIL");
}

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(requiredEnv("RESEND_API_KEY"));
  }
  return resendClient;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendAuthLinkEmail(opts: {
  to: string;
  subject: string;
  url: string;
}) {
  const safeUrl = htmlEscape(opts.url);
  const result = await getResend().emails.send({
    from: authFromEmail(),
    to: opts.to,
    subject: opts.subject,
    text: `${opts.subject}\n\n${opts.url}\n\nThis link expires soon. If you did not request it, ignore this email.`,
    html: `<p>${htmlEscape(opts.subject)}</p><p><a href="${safeUrl}">Continue to Decision Doctor</a></p><p>This link expires soon. If you did not request it, ignore this email.</p>`,
  });

  if (result.error) {
    throw new Error(`Resend email failed: ${result.error.name}`);
  }
}

function createAuthInstance() {
  return betterAuth({
      appName: "Decision Doctor",
      baseURL: baseUrl(),
      secret: requiredEnv("BETTER_AUTH_SECRET"),
      trustedOrigins: Array.from(
        new Set([baseUrl(), "http://localhost:3000", "http://127.0.0.1:3000"]),
      ),
      database: drizzleAdapter(getDb(), {
        provider: "pg",
        schema,
        usePlural: true,
        camelCase: true,
        transaction: true,
      }),
      advanced: {
        useSecureCookies: process.env.NODE_ENV === "production",
        database: {
          generateId: "uuid",
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        requireEmailVerification: process.env.NODE_ENV === "production",
        sendResetPassword: async ({ user, url }) => {
          await sendAuthLinkEmail({
            to: user.email,
            subject: "Reset your Decision Doctor password",
            url,
          });
        },
      },
      emailVerification: {
        sendOnSignUp: process.env.NODE_ENV === "production",
        sendOnSignIn: process.env.NODE_ENV === "production",
        expiresIn: 60 * 60,
        sendVerificationEmail: async ({ user, url }) => {
          await sendAuthLinkEmail({
            to: user.email,
            subject: "Verify your Decision Doctor email",
            url,
          });
        },
      },
      plugins: [
        magicLink({
          expiresIn: 60 * 60,
          allowedAttempts: 1,
          sendMagicLink: async ({ email, url }) => {
            await sendAuthLinkEmail({
              to: email,
              subject: "Your Decision Doctor sign-in link",
              url,
            });
          },
        }),
        nextCookies(),
      ],
      databaseHooks: {
        user: {
          create: {
            after: async (user) => {
              await getOrCreatePersonalTenant(user.id);
            },
          },
        },
      },
    });
  }
let authInstance: ReturnType<typeof createAuthInstance> | null = null;

export function getAuth(): ReturnType<typeof createAuthInstance> {
  if (!authInstance) {
    authInstance = createAuthInstance();
  }

  return authInstance;
}

export async function authHandler(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function getSessionActor(
  request: Request,
): Promise<SessionActor | null> {
  const auth = getAuth();
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const userId = (sessionResult as { user?: { id?: unknown } } | null)?.user
    ?.id;

  if (typeof userId !== "string") {
    return null;
  }

  const tenant = await getOrCreatePersonalTenant(userId);
  return { userId, tenantId: tenant.id };
}
