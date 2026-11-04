import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The game uses WebGL, Web Audio, pointer lock and browser storage, so it only
// loads in the browser after hydration.
const IronMeridianGame = lazy(() => import("@/game/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iron Meridian: Asymmetric Tactical Command" },
      {
        name: "description",
        content:
          "3D tactical/action hybrid game with 1st/3rd-person POV toggling, cross-faction Scavenge & Retrofit progression, and a multi-biome objective theater.",
      },
      { property: "og:title", content: "Iron Meridian: Asymmetric Tactical Command" },
      {
        property: "og:description",
        content:
          "3D tactical/action hybrid game with 1st/3rd-person POV toggling, cross-faction Scavenge & Retrofit progression, and a multi-biome objective theater.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function LoadingScreen() {
  return (
    <div className="im-loading">
      <span className="font-mono">Initializing theater…</span>
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<LoadingScreen />}>
      <Suspense fallback={<LoadingScreen />}>
        <IronMeridianGame />
      </Suspense>
    </ClientOnly>
  );
}
