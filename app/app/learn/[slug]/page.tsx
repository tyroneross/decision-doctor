// app/app/learn/[slug]/page.tsx — KB article detail.

import "server-only";
import * as React from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { getSessionActor } from "@/lib/auth-session";
import { GUEST_PLACEHOLDER_UUID } from "@/lib/guest-identity";
import { getKbArticleBySlug } from "@/lib/kb";
import { ArticleView } from "./ArticleView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function KbArticlePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;

  const session = await auth.api.getSession({ headers: await headers() });
  const guest = !session?.user && (await isGuestRequest());
  const isAuthed = !!session?.user;
  if (!isAuthed && !guest) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-mute">Sign in to view this article.</p>
      </div>
    );
  }

  const actor = isAuthed ? await getSessionActor() : null;
  const userId = actor?.userId ?? GUEST_PLACEHOLDER_UUID;
  const tenantId = actor?.tenantId ?? GUEST_PLACEHOLDER_UUID;

  const article = await getKbArticleBySlug({ userId, tenantId }, slug);
  if (!article) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <ArticleView article={article} />
    </div>
  );
}
