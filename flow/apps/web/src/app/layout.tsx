import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeInit } from "@/components/ThemeInit";
import { UpdaterToast } from "@/components/UpdaterToast";
import { DialogHost } from "@/components/DialogHost";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PhoenixFlow — AI Block-based Platform",
  description: "Build AI workflows visually with drag & drop blocks",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Applies the saved theme on mount (no <script> tag — React 19 rejects
            those in the tree). See components/ThemeInit. */}
        <ThemeInit />
        {children}
        <UpdaterToast />
        <DialogHost />
      </body>
    </html>
  );
}
