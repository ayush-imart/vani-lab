# Deployment options (free-tier research, verify before relying)

Recommendation for a demo: Supabase free (database), Vercel Hobby or Cloudflare Pages (frontend) and a Render free web service (Hono API and Eve). The alternative is IndiaMART's own infrastructure, which fits the "customer data stays in the approved environment" rule better.

- **Vercel Hobby:** non-commercial use only; the fair-use rules count work by paid employees as commercial; function limits differ by source. [S1] [S2]
- **Supabase free:** about 500 MB of database, 2 active projects, paused after 7 days without requests, no automatic backups, and sources disagree on egress. [S3]
- **Render free web service:** sleeps when idle (about a one-minute cold start). Fly.io has no free tier for new accounts, Railway gives only a small credit, and Cloudflare Workers is the best free API option but is not plain Node. [S4]
- **Eve:** self-host as a Node service (`eve build`, `eve start`), persist `.eve/.workflow-data`, and don't rely on `vercelOidc()` alone for auth outside Vercel. [L: backend/node_modules/eve/docs/guides/deployment/self-hosting.md]
- **Autoscale scheduler:** it runs inside the backend process, so a sleeping host needs an external cron calling `POST /autoscale/tick`.

## Sources
- S1 https://vercel.com/docs/limits
- S2 https://vercel.com/docs/limits/fair-use-guidelines
- S3 https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- S4 https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026
