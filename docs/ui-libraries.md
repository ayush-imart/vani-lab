# UI library review

- **bencho.dev:** "Interactive React UI Components & Micro-interactions" gallery. The code view works only when signed in, no CLI or registry was found, and the frontend agent's browser tool could not read the code text. The blocks are dark, self-styled demos. Nothing was imported; the stepper idea was re-implemented as `number-stepper.tsx`. [S1] [L: app/frontend_rework_progress/TASK_LIST.md]
- **rareui.com:** no sign-up needed. Install with `npx shadcn@latest add swamimalode07/rare-ui/<name>`; `animatedcounter`, `stepplayer`, `notificationbell` and `voicenote` looked relevant. Nothing is installed yet. [S2]
- **beui.dev** (fetched, not opened in Chrome): MIT licence, 138 animated components on Motion and Tailwind 4, shadcn registry (`shadcn add @beui/<name>`). It has a Voice Orb and charts; MCP access is Pro only; there are no table or call components. Docs at /docs/theme, /docs/motion-patterns and /llms.txt; source on GitHub at starc007/ui-components. [S3] An earlier user instruction ruled out orbs in the design plan, so confirm before using Voice Orb.
- **Already in the app:** shadcn/ui (Radix), Motion (`motion/react`), the custom `ChipSelect`, `Tip` tooltips and `number-stepper`.

## Sources
- S1 https://bencho.dev/
- S2 https://www.rareui.com/
- S3 https://beui.dev/
