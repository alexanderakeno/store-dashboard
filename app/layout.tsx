import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.APP_NAME || "Store Dashboard",
  robots: { index: false, follow: false },
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
