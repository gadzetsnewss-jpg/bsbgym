import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BSB FitForge Trainer Portal",
    short_name: "FitForge Trainer",
    description: "Mobile Trainer Portal for BSB FitForge Gym ERP",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#063C3B",
    theme_color: "#063C3B",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
