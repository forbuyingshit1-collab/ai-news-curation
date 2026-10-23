import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginForm } from "@/components/login-form";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function LoginPage() {
  const store = await cookies();
  if (await verifySessionToken(store.get(SESSION_COOKIE)?.value)) redirect("/");
  return <LoginForm />;
}
