// PRD §6 (chat extension) — `/app/chat`. Auth-gated thread for conversational
// guidance. The actual UI is a client component since it streams messages and
// persists the thread to localStorage.
//
// C6a: read `seed` searchparam (set by F1 home submit) and pass to <Chat />
// so the chat can auto-submit the user's typed query once on the opening
// assistant message.

import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { Chat } from "@/components/chat/Chat";

// Next.js 16 server-component searchParams shape: a Promise of the resolved
// query map. Always await; values come back as string | string[] | undefined.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string | string[] }>;
}) {
  const actor = await getSessionActor();
  if (!actor && !(await isGuestRequest())) {
    redirect("/sign-in?next=/app/chat");
  }

  const sp = await searchParams;
  const rawSeed = sp.seed;
  const seed = Array.isArray(rawSeed) ? rawSeed[0] : rawSeed;

  return <Chat seed={seed} />;
}
