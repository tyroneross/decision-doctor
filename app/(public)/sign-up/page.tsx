import { redirect } from "next/navigation";

// Personas (Maya, Hank) hit /sign-up directly because the sign-in page tabs
// hide sign-up under a "Sign in" heading. This route opens the sign-in page
// pre-selected on the sign-up tab so the URL matches user intent.
export default function SignUpRoute() {
  redirect("/sign-in?tab=signup");
}
