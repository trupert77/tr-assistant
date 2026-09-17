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
    // Android and desktop Chrome: sharing a link or selection to the installed
    // app opens Today with the capture box filled in. iOS has no share target;
    // the Shortcuts capture API covers the share sheet there.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Focus", url: "/focus", description: "The top three for today" },
      { name: "Ask", url: "/assistant", description: "Ask the assistant" },
    ],
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
