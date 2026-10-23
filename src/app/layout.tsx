import type { Metadata, Viewport } from "next";
import { Archivo, Schibsted_Grotesk, Geist_Mono } from "next/font/google";
import { SplashScreen } from "@/components/splash-screen";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

// Wide, heavy, slanted letters like the Elevate logo. Variable width axis (wdth) so the display style can go extra wide.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Elevate Campus Hub",
    template: "%s · Elevate Campus Hub",
  },
  description: "Change the campus one student at a time. Attendance, engagement and follow-up for Elevate campus teams.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${schibsted.variable} ${archivo.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SplashScreen />
        {children}
        <Toaster theme="light" position="top-center" richColors />
      </body>
    </html>
  );
}
