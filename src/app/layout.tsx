import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAPOR Admin — Store Management",
  description: "Admin panel for the KAPOR clothing store. Store owner only."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
