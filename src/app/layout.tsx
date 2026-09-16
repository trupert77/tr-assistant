import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ThemeColorSync } from "@/components/theme-color-sync";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TR Assistant",
  description:
    "A personal assistant that reads your calendar, inbox, and notes, then helps you plan, write, and follow through.",
  // "default" keeps status-bar text readable in both themes; translucent
  // would draw white text over the cream canvas when Light is forced.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TR Assistant" },
  icons: { apple: "/icons/apple-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#131110" },
  ],
};

// Runs while the HTML is still parsing so a saved theme override applies
// before first paint. Anything invalid or unreadable falls back to the OS.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${mono.variable} h-full antialiased`}
      // The theme script and browser extensions both touch <html> before
      // hydration. This only quiets attribute mismatches on this element.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeColorSync />
        {children}
      </body>
    </html>
  );
}
