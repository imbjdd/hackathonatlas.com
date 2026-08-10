# crons

Scheduled scrapers that discover hackathons from external sources and push them
into the Hackathon Atlas directory.

Runs on [Bun](https://bun.sh). Deployed as a Railway cron job (deployed via the
Railway CLI).

## Layout

```
crons/
├── src/
│   ├── index.ts          # runner: fetch → dedup → push → notify
│   ├── config.ts         # env-driven config
│   ├── types.ts          # NormalizedEvent + Source interface
│   ├── lib/
│   │   ├── http.ts       # fetch helpers (User-Agent, sleep, jitter)
│   │   ├── geocode.ts    # Nominatim geocoding
│   │   ├── push.ts       # /exists dedup + POST to the directory
│   │   └── notify.ts     # Discord summary
│   └── sources/
│       ├── index.ts      # source registry (the extension point)
│       ├── luma.ts       # Luma (lu.ma) source
│       ├── ethglobal.ts  # ETHGlobal (ethglobal.com) source
│       ├── devfolio.ts   # Devfolio (devfolio.co) source
│       ├── dorahacks.ts  # DoraHacks (dorahacks.io) source
│       ├── mlh.ts        # MLH (mlh.io) source
│       └── devpost.ts    # Devpost (devpost.com) source
├── .env.example
└── package.json
```

## Run locally

```sh
cp .env.example .env      # fill in the values
bun install
bun run start             # fetch + push
bun run dry-run           # print payloads, push nothing
```

## Pipeline

1. **Fetch** — each selected source returns `NormalizedEvent[]`.
2. **Dedup** — events already in the directory (matched by `link` via
   `/api/hackathons/exists`) are dropped.
3. **Push** — remaining events are `POST`ed to `/api/hackathons`
   (authenticated with `x-api-secret`).
4. **Notify** — a summary is sent to Discord (if a webhook is configured).

Everything is configured via environment variables — see
[`.env.example`](./.env.example).

## Sources

| Source      | Discovery                                                       | Notes |
| ----------- | -------------------------------------------------------------- | ----- |
| `luma`      | Luma discovery API, scanned by geolocation (`LOCATION`/`LAT`/`LNG`). | Fetches descriptions from the per-event API. |
| `ethglobal` | ETHGlobal `/events` RSC payload — one request lists every event. | Keeps `type=hackathon`; filter statuses with `ETHGLOBAL_STATUSES` (default `future`). Cover/description come from each event page's `og:*` tags. Prize pool isn't reliably exposed, so `cashPrize` is `-1`. |
| `mlh`       | MLH `/seasons/<year>/events` Inertia payload — one request lists every event. | Season defaults to the current one (rolls over in August); override with `MLH_SEASON`, or scan several with `MLH_SEASONS=2021,2022,…` (historical backfill). Filter statuses with `MLH_STATUSES` (default `pending,in_progress`). Links to each event's own MLH page (unique per edition, so recurring hackathons don't collapse across seasons); descriptions come from the hackathon's site `og:description`. Prize pool isn't exposed, so `cashPrize` is `-1`. |
| `devpost`   | Devpost public `/api/hackathons` JSON API, paginated (9/page). | Filter open states with `DEVPOST_STATUSES` (default `upcoming,open`). Human date ranges are parsed to ISO; cover/description come from each hackathon page's `og:*` tags. Only `$` prizes are treated as USD (others → `-1`). |
| `devfolio`  | Devfolio public Hasura GraphQL API (`api.devfolio.co/v1/graphql`), paginated with `limit`/`offset` (20/page) ordered by `ends_at desc` — walks the entire archive. | Name, dates, city, country and full description come straight from GraphQL in one query. `DEVFOLIO_MAX_PAGES` bounds pagination; `LIMIT` caps kept events (raise both for a full backfill). Geocoding is cached by location and throttled. Cover images (the only field GraphQL omits) are read from each `<slug>.devfolio.co` microsite's `cover_img` only when `INCLUDE_DESCRIPTIONS` is set. Prize pool isn't exposed, so `cashPrize` is `-1`. |

## Adding a new source

A source is anything that implements the `Source` interface from
[`src/types.ts`](./src/types.ts): a `name` and a `fetchEvents(ctx)` that returns
normalized events. The runner handles dedup, pushing, and notifications — a
source only has to fetch and normalize.

1. Create `src/sources/<name>.ts`:

   ```ts
   import type { Source } from "../types.js";

   export async function createDevpostSource(): Promise<Source> {
     return {
       name: "devpost",
       async fetchEvents(ctx) {
         // fetch, then map each item to a NormalizedEvent
         return [];
       },
     };
   }
   ```

2. Register it in [`src/sources/index.ts`](./src/sources/index.ts):

   ```ts
   export const SOURCE_REGISTRY = {
     luma: createLumaSource,
     devpost: createDevpostSource, // 👈
   };
   ```

3. Select it at runtime with `SOURCES=devpost` (or leave `SOURCES` empty to run
   every registered source).
```
