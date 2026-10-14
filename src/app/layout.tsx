import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

const geist = localFont({
  src: [
    { path: "../../assets/fonts/geist-400.ttf", weight: "400" },
    { path: "../../assets/fonts/geist-500.ttf", weight: "500" },
    { path: "../../assets/fonts/geist-600.ttf", weight: "600" },
    { path: "../../assets/fonts/geist-700.ttf", weight: "700" },
  ],
  variable: "--font-geist",
  display: "swap",
});

const instrument = localFont({
  src: [{ path: "../../assets/fonts/instrument-serif-400.ttf", weight: "400" }],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Ogarnio Estate", template: "%s · Ogarnio Estate" },
  description: "Marketing biura nieruchomości: marka, oferty, treści i grafiki w jednym miejscu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${geist.variable} ${instrument.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-[10px] !border !border-line !bg-surface !text-ink !shadow-md !font-sans",
              description: "!text-ink-3",
            },
          }}
        />
      </body>
    </html>
  );
}
