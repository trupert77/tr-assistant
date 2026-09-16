import type { MetadataRoute } from "next";

// Colors match --canvas in globals.css and THEME_COLORS in lib/theme.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TR Assistant",
    short_name: "TR",
    description:
      "Capture anything in one sentence. Tasks, follow-ups, and notes, filed for you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#131110",
    theme_color: "#131110",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
