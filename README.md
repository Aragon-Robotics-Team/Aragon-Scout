# Aragon Scout

Real-time match scouting for the FTC **BIOBUZZ** (2026–27) season. It's a dark-mode, phone-first PWA that works fully offline and syncs to Supabase when a connection returns.

- **One account per team.** Every scout signs in with it, and many devices can record at once.
- **Recording flow:** pre-match info and **Confirm**, then **Start** when the match starts: **Auto 0:30**, an **8s transition** (taps still count as auto), and **Teleop 2:00**. The period clock shows the 2:30 match clock beside it. **Stop**/**Start** pauses the clock mid-match, and **End match** finishes early. After that come the post-match fields and Submit. A recording that ended early or was stopped is labeled **incomplete**; it counts toward accuracy but not toward averages.
- **Starting position:** picked on a field map in a popup. A tap snaps the robot to the nearest legal start (G304: own half, against the wall, clear of the loading zone and flowers), and dragging turns it. The map opens again from the match page and the live screen.
- **Live tapping:** nectar/pollen score and miss, hive tips, and Leave/Park toggles right under the clock. Park lights up for the last 15s of auto and of teleop. Everything lands on a half-height live timeline, with undo, and the whole screen fits a standard phone without scrolling.
- **Flowers:** on the post-match form, tap each of the 4 flowers on a field map and enter its balls bottom → top (scoring part only). Owner (top-most nectar), bottom-nectar bonus (bottom-most nectar) and points are worked out for both alliances, and every scout's flowers are compared.
- **My Matches:** one row per match, merged from every recording of that match. Every recording is kept. When they disagree:
  - **small differences** (≤2 balls, ≤3 points) only warn, and stats use the average;
  - **large differences** and **hive tips that don't line up** (different counts, or a tip with no match within 5s in another scout's recording) say "needs fixing" and stay out of stats until someone taps **Resolve** on the match page to pick the right value (saved on the tournament; the recordings stay as entered) or **Keep as is**. Scouts also get a warning at Submit.
  - Matching tips' times are averaged. Recordings whose clock was stopped count toward tip totals but not tip times.
  - The limits are constants in `LIMITS` in `src/lib/consensus.ts`; there's no setting for them in the app.
- **Alliance estimate:** each alliance's estimated total (end-of-match counts + tips + each scouted robot's leave/park) shows next to the entered score.
- **Tournament setup:**
  - a **team list**: paste, add by hand, or fetch from FTCScout, which feeds a type-to-filter team name dropdown
  - a **qualification schedule**: typed into a grid, pasted, read from an FTC Live / MatchMaker **PDF** on the device, or fetched from FTCScout. Every source goes through a review grid before it's saved.
- **Schedule-aware recording:** for a scheduled qual, enter the match # and tap one of the 4 robots to fill in the team, alliance, partner and opponents. Partner and opponent fields take a team number or name. When the schedule doesn't cover a match (playoffs), the lineup is filled from other recordings of that match; anything already typed only gets a suggestion. Qual and playoff matches are kept apart (Q12 / P3).
- **Tournament analysis:** per-team averages, accuracy, park rates, estimated robot points, and a per-match chart.
- **JSON export** (one match, one tournament, or everything) and import.
- **Optional public sharing** as a read-only link `/t/<team#>`. Only your team's signed-in scouts can ever write.

Point values default to Competition Manual V1, Table 10-2 and Table 10-3. They can be edited per tournament.

> **Tip scoring note.** "Hive tip" is tapped for every tip by the scout's *alliance*, whichever robot caused it. Tips count toward the alliance's total, and a robot's estimated points include its alliance's tips, so they're labeled "Estimated score is influenced by alliance member performance." Recordings made before this rule (no `allianceTips` flag) only tapped the scouted robot's tips; they still count, but aren't checked against other scouts. The attribution lives in `robotStats()` in `src/lib/scoring.ts`.

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: scoring, grouping, timing, sync merge, import/export, schedule/PDF/FTCScout parsing
npm run build      # production build + service worker in dist/
```

Without Supabase keys the app runs in **local-only mode**: no accounts and no sync, with data kept on the device. That mode is useful for trying it out.

## Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com). The free tier is fine.
2. **SQL Editor → New query**: paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates:
   - the `profiles`, `tournaments` and `reports` tables (each report is a `jsonb` document)
   - Row Level Security:
     - only the owning team can insert, update or delete
     - reports must carry the owner's own team number
     - reads are private unless the team turns on sharing
   - a last-write-wins guard for offline sync
3. **Authentication → Sign In / Providers → Email**: leave email + password enabled, with **Confirm email** on.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL (e.g. `https://aragon-scout.vercel.app`) so confirmation links open the app.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `.env.local`:

```sh
cp .env.example .env.local
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
```

The anon key is meant to be public. Row Level Security is what protects the data.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com): **Add New → Project**, then import the repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then click **Deploy**.
4. Put the resulting URL into Supabase's **Site URL** (step 4 above).

`vercel.json` rewrites every route to `index.html` so links like `/t/12345` work.

## How offline sync works

- Every save goes to **IndexedDB** first and is marked *dirty*. The app never waits on the network.
- When online (on load, on reconnect, every 30s, and after each save), the sync engine does two things:
  - **Pull:** fetches rows changed since its last cursor.
  - **Push:** upserts dirty rows.
- Conflicts resolve **last-write-wins** by edit time, enforced on the server by the `sync_guard` trigger.
- A scout must sign in **once while online**. After that the app opens and records with no connection. The circle in the header shows sync status: green = synced, amber = waiting, grey = offline.
- On phones, use **Add to Home Screen** so the app opens full screen and offline.

## Project layout

```
src/lib/        types, BIOBUZZ timing & scoring, grouping/analysis, IndexedDB, sync, import/export
src/app/        auth + data providers (local DB for the team, read-only for public links)
src/components/ live scoring screen, timeline, forms, chart, layout
src/pages/      one file per screen
supabase/       schema.sql (tables + RLS)
```
