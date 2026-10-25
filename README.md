# RadarX V0.6 — Gulf + MENA regional aviation map

RadarX is a browser-only flight observation map hosted on GitHub Pages. Public ADS-B observations are obtained through the existing Cloudflare Worker at https://radarx.saifeddinkhmiri.workers.dev. This is an independent aviation tool, not a copy of Flightradar24's tracking network.

## Default geographic coverage
- **Gulf + MENA is the default**, not Doha.
- **16 geographically distributed sectors** cover portions of Morocco, Algeria, Tunisia, Libya, Egypt, the Levant, Turkey, Iraq, Iran, Saudi Arabia, Yemen, Oman, the UAE, Bahrain, Qatar and Kuwait.
- Every sector uses an individual **250 nautical mile** radius request (approximately 463 km, under the free plan's maximum 500 km radius). The regions are sampled sequentially, NOT simultaneously.
- The initial sector bootstrap runs in short intervals until all 16 have been requested. Subsequent requests rotate sectors roughly every 20 seconds while the page is visible, subject to network availability. A complete update cycle is therefore over five minutes.
- Reported aircraft are merged by their ICAO hex IDs; the most recent observed position is retained and snapshots expire after 12 minutes.
- **This does not provide uninterrupted or complete geographic coverage.** There are gaps between circles, and coverage depends on the provider's ADS-B receiver network. An absent aircraft does not prove absence from the sky.
- Switching to **Gulf only** scans the nine Gulf-focused sectors. Choosing Qatar or another named region switches to a local search. The Search this area button also switches to a local query.
- Regional mode shows scan-sector progress, not a single global feed timestamp. These data are time-staggered; aircraft positions can be several minutes old.

## Data classifications
- Provider dbFlags and SDR Enthusiasts' community Plane Alert DB contribute military and government classifications.
- Entries are best-effort, may be outdated or erroneous, and are not guaranteed verified.
- Other means **other or unclassified**, not necessarily confirmed civilian.
- Military + Gov filter allows an approximate comparison with FR24's category, but the feeds and coverage will not match automatically.

## Interface
- MapLibre with OpenFreeMap; browser-only, zero installation.
- Filter panel, source-age and diagnostic report, favourites, four themes, responsive styles, region selectors and session traffic summaries.
- Client-side transitions connect newly observed positions without generating additional API calls.
- Freeze positions prevents new snapshot updates from changing the map.
- Queries are scoped to the user's selected scanning mode.

## Free API quota caution
- FlyItalyADSB free API limits apply from October 27, 2026: 30 requests/minute and 300,000/month per key; 500 km maximum request radius.
- Regional rotation at one request per 20 seconds is about 129,600 upstream requests/month for a continuously active single viewer if none are served from cache. More users or multiple edge caches increase use; limits can be reached.
- Bootstrapping has a faster cadence and must not be repeated frequently. Add global Worker rate limits, shared cache strategy and usage counters before scaling beyond limited testing.
- The Worker is managed separately and is NOT changed by GitHub commits. Existing configured Worker TTL is reported by the operator as 10 seconds. Individual sector polling periods are much longer than this.
- Do not expose API secrets in GitHub Pages.

## Limitations and next production tasks
- Browser runtime validation and QA of the v0.6 regional scan
- Cloudflare quota guard / origin-specific request throttling
- More comprehensive regional grid and scheduling strategies constrained by quota
- Provider-specific military endpoint and sources only with proper authentication, attribution and usage permissions
- Proper historical playback, aircraft-type icons and travel routes if authorized data become available

## Publish
GitHub Pages → deploy branch `main` from repository root: https://xprotn-dev.github.io/radarx/

## Credits
FlyItalyADSB aircraft data (CC BY-SA 4.0), OpenFreeMap / © OpenMapTiles and © OpenStreetMap contributors, MapLibre, and SDR Enthusiasts Plane Alert DB community classifications (ODbL 1.0).
