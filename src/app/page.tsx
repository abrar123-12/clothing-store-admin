import { redirect } from "next/navigation";

// The admin site has only two pages: login and the panel.
export default function Home() {
  redirect("/login");
}
