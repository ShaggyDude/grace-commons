// app/login/page.tsx — GET /login (C13 entry). Standalone, centered, no top bar
// (pre-auth). Ports render 1's login.tsx; the form is the <LoginForm/> island.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { optionalUser } from "../../auth/current.ts";
import { LoginForm } from "../../components/LoginForm.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in → straight to the dashboard (render 1 behaviour).
  if (await optionalUser()) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="mb-8 text-center">
          <span className="linkamation text-xl">Beacon</span>
          <p className="mt-1 text-sm opacity-50">Clinical Research Portal</p>
        </div>

        <LoginForm />

        <div className="mt-6 text-xs text-center space-y-1 opacity-40">
          <p className="font-medium">Demo accounts</p>
          <p>
            <code>anya@beacon.clinical</code> / <code>demo-pi</code> — Principal Investigator
          </p>
          <p>
            <code>jordan@beacon.clinical</code> / <code>demo-cra</code> — Clinical Research Associate
          </p>
        </div>
      </div>
    </div>
  );
}
