import { redirect } from "next/navigation";

/** The clients table is the app's home. `/` redirects to the single Clients tab. */
export default function HomePage() {
  redirect("/clients");
}
