import type { Metadata, Viewport } from "next";
import "./globals.css";

/** Name under the Home Screen icon (iPhone "Add to Home Screen" / Android install). */
const SHORT_NAME = process.env.APP_SHORT_NAME || "Kokas";

// icons: app/apple-icon.png (iPhone Home Screen, 180 px) + app/icon.svg (browser tab); app/manifest.ts for Android
export const metadata: Metadata = {
  title: process.env.APP_NAME || "Store Dashboard",
  robots: { index: false, follow: false },
  appleWebApp: { title: SHORT_NAME },
  applicationName: SHORT_NAME,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

/** Applies the saved theme / font size before first paint (no flash). */
const PREFS = `try{var t=localStorage.getItem("sd-theme");if(t==="dark")document.documentElement.classList.add("dark");var f=localStorage.getItem("sd-font");if(f)document.documentElement.dataset.font=f}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
