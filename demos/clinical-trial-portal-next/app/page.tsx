// app/page.tsx — GET / (landing). Mirrors render 1's `/` → redirect: signed-in
// users land on the dashboard, everyone else on the login page.
import { redirect } from "next/navigation";
import { optionalUser } from "../auth/current.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await optionalUser()) ? "/dashboard" : "/login");
}
