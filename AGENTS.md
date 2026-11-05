<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules
- The Iron Meridian game lives in `src/game/` (ported from the original Vite app) and is lazy-loaded behind `<ClientOnly>` in `src/routes/index.tsx` — it uses WebGL, Web Audio, pointer lock and localStorage, which must never run during SSR.
- Campaign saves are written to browser localStorage first (`src/game/systems/campaignSaveSystem.ts`); signed-in players (Google via Lovable Cloud) also sync to the owner-only `campaign_saves` table through `src/game/systems/cloudSave.ts`, newest `savedAt` wins — guests must always be able to play without an account.
- The city is generated deterministically from data in `src/game/city/cityLayout.ts` (buildings, floors, rooms, stairs, loot ids) and rendered/collided by `cityBuilder.ts`; loot and building ids must stay stable because saves reference them.
- Mission/story data lives in `src/game/campaign/campaignData.ts`; pacing and step rules are pure functions in `campaignRules.ts` with vitest coverage — the 3D arena's mission director only calls them, so change rules there and update the tests.
- `TacticalArena3D` exposes a dev-only `window.__game` hook (`teleport`, `state`, `building`, `killNear`, `destroyConvoy`) for Playwright checks; it is gated by `import.meta.env.DEV`.
- The soundtrack is procedural Web Audio in `src/game/systems/musicEngine.ts` (no audio files); phase selection is the pure, tested `musicDirector.ts` — the arena only reports threat, App only sets the context (home/map/playing/victory).
- `tsconfig.json` disables noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes to match the ported game code, which was written without them.
