# Hackathon Atlas

The open-source platform to discover hackathons near you and around the world. Search by city, region, or topic. Filter by prizes, participants, dates, and more.

## Links

- [Website](https://hackathonatlas.com)
- [DeepWiki](https://deepwiki.com/imbjdd/hackathonatlas.com)

## Dev

Requires [Bun](https://bun.sh) >= 1.3 and `wrangler login` on the Cloudflare
account. `next dev` uses the Worker's bindings remotely, so it reads and writes
production data (D1 database, R2 media bucket).

```sh
bun install
bun run dev
```

Runs at `http://localhost:3000`.

## Hosting

Everything runs on Cloudflare, configured in `apps/web/wrangler.jsonc`:

- **Site**: Next.js on Workers via [OpenNext](https://opennext.js.org/cloudflare)
  (worker `hackathonatlas`, zone route `hackathonatlas.com/*`).
  Deploy with `cd apps/web && bun run deploy`.
- **Database**: D1 `hackathonatlas` (Drizzle, SQLite). After changing
  `src/db/schema.ts`, run `bun run db:generate` then `bun run db:migrate`.
- **Media**: event covers and thumbnails in the R2 bucket `hackathonatlas-media`,
  thumbnails generated with the Cloudflare Images binding.
- **Secrets**: `HACKATHONS_API_SECRET`, `ADMIN_SECRET`, `OPENAI_API_KEY`
  (`wrangler secret put …`).
- **Scrapers** (`crons/`): the manual *Crons* GitHub Actions workflow.

## Community

See CONTRIBUTING.md for guidelines, maintainers, and how to submit PRs.

Thanks to all contributors:

<a href="https://github.com/imbjdd/hackathon-directory/graphs/contributors">
  <img src="CONTRIBUTORS.svg" />
</a>

## License

All rights reserved.
