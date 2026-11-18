import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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

/** Width a phone lays the page out at in "Tampilan desktop" (the desktop layout, zoomed out to the screen). */
const DESKTOP_VIEW_WIDTH = 1280;
/** Screen width (px) from the "sd-view" cookie, or null when the phone view is used. */
const desktopView = (v: string | undefined) => {
  const m = /^desktop:(\d{3,4})$/.exec(v ?? "");
  return m ? Math.min(1024, Math.max(280, Number(m[1]))) : null;
};

/**
 * Cookie "sd-view=desktop:<screen width>" (set by the header button on phones) renders the page at the desktop
 * width, zoomed out so the whole width fits the phone's screen (the screen width is stored with the choice).
 */
export async function generateViewport(): Promise<Viewport> {
  const view = desktopView((await cookies()).get("sd-view")?.value);
  return {
    ...(view ? { width: DESKTOP_VIEW_WIDTH, initialScale: Math.round((view / DESKTOP_VIEW_WIDTH) * 1000) / 1000 } : { width: "device-width", initialScale: 1 }),
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
      { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
    ],
  };
}

/** Applies the saved theme / font size before first paint (no flash). */
const PREFS = `try{var t=localStorage.getItem("sd-theme");if(t==="dark")document.documentElement.classList.add("dark");var f=localStorage.getItem("sd-font");if(f)document.documentElement.dataset.font=f}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const desktop = desktopView((await cookies()).get("sd-view")?.value) != null;
  return (
    <html lang="id" suppressHydrationWarning data-view={desktop ? "desktop" : undefined}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
