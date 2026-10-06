import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Planner",
    short_name: "Planner",
    description: "Planejamento do dia, tarefas e registro de tempo",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova tarefa", url: "/?new=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Iniciar cronômetro", url: "/?timer=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
