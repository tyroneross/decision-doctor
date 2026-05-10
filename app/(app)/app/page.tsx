// /app — chat-first entry. Redirects to /app/chat.
// Template selector still available at /app/templates as the fast-path for
// users who already know which decision they're working on.

import { redirect } from "next/navigation";

export default function AppRoot() {
  redirect("/app/chat");
}
