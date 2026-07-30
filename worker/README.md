# Sync relay

A ~50 line Cloudflare Worker that holds one encrypted blob per room. It is a
mailbox, not a service: it cannot read anything it stores.

## Deploy

```sh
cd worker
npx wrangler kv namespace create SYNC     # copy the id into wrangler.toml
npx wrangler deploy
```

Wrangler prints a URL like `https://trapram-relay.<you>.workers.dev`. Paste it
into TrapRAM → Settings → Sync, generate a key, and enter the same URL and key
on the second machine.

## What it costs

The free plan gives 100,000 worker requests and 100,000 KV reads a day, and
1,000 KV writes. One device polling every 15 minutes is 96 reads a day, and a
write only happens when something actually changed. Two machines land around
200 requests a day — roughly 0.2% of the allowance.

## API

| Route | Behaviour |
| --- | --- |
| `GET /r/<room>` | `{ v, blob }`, or `404` for an empty room. Sends an `ETag`; honours `If-None-Match` with a `304`. |
| `PUT /r/<room>` | Body is the base64 blob, `If-Match` is the version it was read at. `409` when another device wrote first. |
| `DELETE /r/<room>` | Wipes the room. |

`room` is 32 hex characters derived from the sync key, so rooms are not
enumerable and no other auth is needed.

Rooms expire 60 days after their last write. Every sync refreshes that, and the
relay is never the only copy of anything — the vault on each machine is.
