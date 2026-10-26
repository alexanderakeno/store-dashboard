import type { MetadataRoute } from "next";

/** Web app manifest: name + digiplus icon when the dashboard is added to an Android Home Screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.APP_NAME || "Store Dashboard",
    short_name: process.env.APP_SHORT_NAME || "Kokas",
    start_url: "/home",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
