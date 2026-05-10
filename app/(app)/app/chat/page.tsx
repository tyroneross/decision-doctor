// /app/chat — chat-first decision interface (the new primary entry).
// Server component shell; client component handles the interactive turn loop.

import { redirect } from "next/navigation";
import { getActorSession } from "@/lib/session";
import { ChatClient } from "@/components/chat/chat-client";

export const metadata = { title: "Decide · Decision Doctor" };

export default async function ChatPage() {
  const session = await getActorSession();
  if (!session) redirect("/sign-in");
  return (
    <main className="px-4 sm:px-6 py-4 max-w-2xl mx-auto min-h-[calc(100vh-3.5rem)] flex flex-col">
      <ChatClient />
    </main>
  );
}
