// PRD §6 (chat extension) — `/app/chat`. Auth-gated thread for conversational
// guidance. The actual UI is a client component since it streams messages and
// persists the thread to localStorage.

import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { Chat } from "@/components/chat/Chat";

export default async function ChatPage() {
  const actor = await getSessionActor();
  if (!actor) redirect("/sign-in?next=/app/chat");
  return <Chat />;
}
