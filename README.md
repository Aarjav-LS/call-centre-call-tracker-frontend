# CallTrack Frontend

Static Vite + TypeScript single-page dashboard. Deployed to Vercel.

## Local run

```bash
pnpm install
pnpm run dev
```

Open `http://localhost:3000`. Without `VITE_API_URL` the app stays local-first and only uses `localStorage`.

## Connect to the API

```bash
cp .env.example .env.local
```

Set `VITE_API_URL` to the deployed backend origin, for example `https://calltrack-api.onrender.com`. When it is set, the app loads the shared counters on start and pushes each change to `PUT /api/state`. If the API is unreachable it falls back to `localStorage` and shows an offline status.

The **Send report to supervisor** button is only enabled when `VITE_API_URL` is set, because reporting goes through the API.

## Dashboard sections

- **Metrics band** — total calls, total received, not received. Not Received is editable.
- **Call flow strip** — coverage bar and the highest outcome.
- **Outcome ledger** — the ten received outcomes with their counters.
- **Cluster directory** — add and remove cluster code and college name pairs. Stored in this browser only, under `calltrack-clusters-v1`. Entries are per-operator; the supervisor sees them when the report is sent.
- **Desk note** — the operator name and the report button.

## Pages

The app is a single-page app with three routes, selected from the sidebar. `vercel.json` rewrites
every path to `index.html` so a direct visit or a refresh works.

| Route      | Page            | Contents |
| ---------- | --------------- | -------- |
| `/`        | Dashboard       | Metrics, call flow, outcome ledger, cluster directory, report button. |
| `/visits`  | Visits          | Visit prospects: calendar, add form, full list, and the per-date breakdown. |
| `/rhythm`  | Received rhythm | Weekly contact pace and the ranked outcome mix. |

### Visits page

- **Calendar** with month navigation. Dates that have prospects show an amber count bubble and small
  coloured dots for each status present. Today is marked, the selected date is highlighted.
- **Three summary tiles** for the selected date: Prospect in yellow, Visited in blue, Dead in red.
- **Add form** for name, contact number, visit date, college, status, and remarks.
- **Status dropdown** on every row to change a prospect's status after the fact.
- Prospects are stored in this browser under `calltrack-prospects-v1` and never leave it.

## What the report contains

The report button sends only three things: the operator name, the call counters, and the cluster
list. That is the full payload, and the API and sheet have no field for anything else.

**Visit prospects are deliberately excluded.** They are a private working list for the operator and
are never sent to the API, the Google Sheet, or the server CSV log. If you later want them in the
report, that is a change to `sendReport` in `src/main.ts`, the `sanitizeReport` schema in
`../backend/src/report.js`, and the Apps Script in `../backend/apps-script/Code.gs`.

Clusters and the operator name are also local until a report is sent. See
`../backend/GOOGLE_SHEET_SETUP.md` for the supervisor-side setup.

## Deploy to Vercel

1. Push this folder to its own Git repository and import it in Vercel. Vercel detects Vite automatically; keep the defaults (build `pnpm run build`, output `dist`).
2. Add the environment variable `VITE_API_URL` pointing at the Render backend.
3. In the Render service, set `CORS_ORIGIN` to your Vercel URL, e.g. `https://your-app.vercel.app`.
4. Deploy. `vercel.json` rewrites every path to `index.html` so `/rhythm` and hash links work on refresh.

Render's free tier sleeps when idle, so the first request after a cold start can take a few seconds.

## Scripts

| Script          | Purpose |
| --------------- | ------- |
| `pnpm run dev`  | Vite dev server on port 3000. |
| `pnpm run build`| Production build into `dist`. |
| `pnpm run check`| TypeScript type check, no emit. |
