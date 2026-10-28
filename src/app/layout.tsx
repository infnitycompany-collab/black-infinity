import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-arabic/400.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import { LocaleProvider } from "@/lib/locale";
export const metadata: Metadata = {
  title: {
    default: "Black Infinity · Your media. Your space.",
    template: "%s · Black Infinity",
  },
  description:
    "A considered home for your media. Private vault, smooth playback, and privacy you can understand.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Black Infinity",
    statusBarStyle: "black-translucent",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101014",
};
export const dynamic = "force-dynamic";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-bs-theme="dark">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
