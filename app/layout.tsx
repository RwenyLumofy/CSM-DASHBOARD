import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { authEnabled } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumofy Signals",
  description: "Centralized client data, playbooks, and retention reporting for the Lumofy CSM team.",
  icons: { icon: "/brand/logo-mono-vertical-black.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );

  // Only mount ClerkProvider when keys are configured; otherwise run open (dev).
  return authEnabled() ? <ClerkProvider>{content}</ClerkProvider> : content;
}
