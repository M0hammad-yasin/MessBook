import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Messbook — Meals, members & fair shares",
  description:
    "Manage your mess with clear meal attendance, fair expense allocation, and transparent PKR settlements.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
