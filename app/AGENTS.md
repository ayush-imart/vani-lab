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

## VANI Lab architecture

- Keep VANI Lab frontend-only with synthetic data in a dedicated data module; the team's external backend will replace that boundary.
- Use the workspace's fixed TanStack Start router with TypeScript and one leaf route per screen; Next.js cannot be substituted in this environment.
- Use shared shadcn primitives and global semantic CSS tokens for all screens so the theme remains centrally replaceable.
- Version mascots use imported 3×3 sprite sheets of identical static frames through page-mascot: no rotation or squeeze animations (user rejected them; blinking is the only acceptable future motion). Replace the sheets without changing the UI contract.
