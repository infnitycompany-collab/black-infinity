import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Black Infinity",
    short_name: "Infinity",
    description: "Your private media space",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#101014",
    theme_color: "#101014",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
