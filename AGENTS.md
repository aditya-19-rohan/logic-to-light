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

- Backend lives in `backend/` (plain JS Express + Mongoose, deployed separately to Render); the React app syncs to it only when `VITE_API_URL` is set and otherwise falls back to localStorage — keeps the demo working without a server.
- Clinical rules exist in both `src/lib/` and `backend/lib/clinical.js`; change both together so client and server validation agree.
