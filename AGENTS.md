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
- Campaign saves stay in browser localStorage (`src/game/systems/campaignSaveSystem.ts`); no backend is used yet.
- `tsconfig.json` disables noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes to match the ported game code, which was written without them.
