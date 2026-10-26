import type { MetadataRoute } from "next";

// Lets students add the site to their phone's home screen like an app
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "De Kings Perfection Private School",
    short_name: "DKPS",
    description: "Student dashboard, results, tests and assignments",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#071f3d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}