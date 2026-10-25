# RadarX V0.7 — Gulf and MENA aviation observations

RadarX is a browser-only GitHub Pages aircraft observation map using a Cloudflare Worker for the FlyItalyADSB REST API. It is **not** a complete real-time military radar or a replication of Flightradar24's network.

## Important fixes in V0.7

**The previous V0.6 map was misleading.** It combined geographic snapshots up to 12 minutes old and rendered them as if they were all current. V0.7 now:

- Treats aircraft positions no more than **90 seconds old** as recent.
- Holds 90–180-second positions only as optional grey **stale** records; they are excluded by default.
- Expires records after 180 seconds, deduplicates by ICAO hex, and retains only the newest position from overlapping sectors.
- Shows the number of sectors sampled **within 90 seconds**, not only how many sectors have ever been visited.
- Refreshes UI positions periodically even if no new regional response arrives, so expired records disappear.
- Limits map animation to approximately 12 FPS rather than rewriting the map source every browser frame.
- Scans the geographic sectors more conservatively after initial sampling, protecting the limited free API quota.
- Does not label a count of zero known military aircraft as proof of no military flights.

**Consequence:** after these corrections, the number of aircraft displayed in regional mode can become substantially smaller. That is more honest than plotting stale positions as live.

## Dedicated military source (requires a one-time Cloudflare update)

FlyItalyADSB publishes a documented worldwide endpoint `GET /v2/mil` for currently tracked military-tagged aircraft. The source is based on its receiver network and **cannot see aircraft that are not in that network**.

RadarX V0.7 prepares a `GET /v1/mil` browser API endpoint, but the existing Cloudflare Worker does not support it until you deploy the companion Worker script:

1. In GitHub open **cloudflare-worker-v2.js**.
2. Copy the entire file as text; do not download or install anything.
3. Cloudflare dashboard → Workers & Pages → **radarx** → **Edit code**.
4. Replace the old Worker script with the new one and click **Deploy**.
5. Confirm the existing secret **FLYITALY_API_KEY** remains configured in Cloudflare. Never paste the secret into GitHub.
6. Visit `https://radarx.saifeddinkhmiri.workers.dev/v1/status` and confirm `version: worker-v2`. Then open `https://radarx.saifeddinkhmiri.workers.dev/v1/mil` and check for a JSON response with an `ac` array.
7. Reload RadarX at `https://xprotn-dev.github.io/radarx/` using Ctrl+Shift+R. The UI should say **Global military feed connected** when the Worker route responds.

The Worker preserves `/v1/near`, includes `/v1/mil`, and applies **10 seconds** cache to local nearby searches and **30 seconds** to the global military endpoint. It does not guarantee a single globally shared cache across Cloudflare edge locations, and it does **not** implement a globally synchronized rate limiter.

The client checks military snapshots no more often than once every 30 seconds while visible and scans ordinary geographic sectors at a lower cadence. Local area mode continues using the regional `/v1/near` endpoint.

### API budget and coverage

The announced free plan starts 27 October 2026 with **30 upstream requests per minute**, **300,000 per month**, and **500 km maximum radius**. Each geographic request uses **250 nautical miles** (~463 km), under that limit. Multiple viewers and Cloudflare edge sites can exceed the provider quota. This remains a personal prototype unless a globally rate-limited backend and usage monitoring are deployed.

The military endpoint may contain aircraft outside Gulf/MENA; the frontend clips its military results to broad MENA coordinates (longitude −18 to 65, latitude 12 to 44), or to a narrower Gulf box in Gulf mode. These bounding boxes are approximate, not official political borders.

## Geographic coverage

- **Gulf + MENA** is the default map region.
- 16 radius sectors survey the Middle East, North Africa, Turkey and Iran.
- **Gulf only** uses 9 Gulf-focused radius sectors.
- This sequential polling is a **regional survey**, not a simultaneous MENA-wide aircraft snapshot. It contains gaps and older sector timestamps.
- The dedicated global military endpoint helps identify more *observed* military-tagged aircraft, but cannot fill receiver gaps or duplicate Flightradar24's database.

## Aircraft identity and licensing

- Live source: FlyItalyADSB (CC BY-SA 4.0).
- Aircraft classifications: provider `dbFlags`, global `/mil` source flag when enabled, plus SDR Enthusiasts' Plane Alert DB (ODbL 1.0).
- Classification is community-derived or provider-tagged, not a verified assertion about passengers, owners, mission or identity.
- Map uses MapLibre, OpenFreeMap / OpenMapTiles and OpenStreetMap contributors.

## Remaining limitations

- Browser visual QA is still needed for the current deployment. JS syntax and unit tests do not prove real-world network coverage or rendering accuracy.
- Airport departure/arrival routes, aircraft photography, cross-provider matching, and true worldwide civilian live positions are not in the available free aircraft feed.
- Cloudflare Worker must be pasted/deployed by the Cloudflare account owner; changes pushed to GitHub are not deployed to Cloudflare.
- For production use, implement a single shared regional data store, quota accounting and global rate limiting rather than independent browser sampling.

Repository: https://github.com/XproTN-dev/radarx

Published website: https://xprotn-dev.github.io/radarx/
