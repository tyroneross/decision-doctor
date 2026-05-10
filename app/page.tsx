import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Root: send authenticated users to the app, others to sign-in.
export default async function Root() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/app/decisions");
  redirect("/sign-in");
}
