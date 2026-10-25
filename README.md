# RadarX — Gulf Aviation Tracker

RadarX is a free browser-based aircraft map, designed with a light aviation-radar layout. It is an independent app and does not copy Flightradar24 branding or proprietary code.

## V0.1 capabilities
- Light map using MapLibre GL JS and OpenFreeMap Bright
- Public aircraft observations from FlyItalyADSB via a Cloudflare Worker
- Rotating plane symbols, aircraft list, filtering, search, details, and mobile interface
- Military aircraft identified via the source's dbFlags military bit
- Government filter is intentionally empty until independently verified identities are incorporated
- Positions can be incomplete or delayed. Other/unverified is not equivalent to confirmed civilian.
- Query around Doha by default (180 nautical miles). Pan and use Search this area to look elsewhere.
- Aircraft are refreshed every two minutes while the page is open and visible; source/relay caching can delay updates further.
- All values and displays are observations, not a primary radar picture.

## Publish using GitHub Pages
1. Go to Settings → Pages.
2. Select Deploy from a branch.
3. Choose main and /(root); Save.
4. Open https://xprotn-dev.github.io/radarx/ after GitHub Pages deployment succeeds.

No downloads, Node.js, server installation or compilation are required.

## Backend configuration
The live data backend already deployed is:
https://radarx.saifeddinkhmiri.workers.dev

The frontend calls /v1/near?lat=25.7200&lon=51.5300&dist=180. Distance in the Worker endpoint is nautical miles, and the Worker converts it to km for the upstream FlyItalyADSB provider.

Keep the private FlyItalyADSB key in Cloudflare as a Worker secret named FLYITALY_API_KEY. NEVER add a key to GitHub, HTML, or JavaScript.

The current Cloudflare Worker is shared publicly. Before inviting large numbers of users, add server-side request throttling and coarser regional cache keys to avoid exhausting the upstream free quota. As documented in October 2026, the provider free plan changes to 30 requests/minute, 300,000/month and 500 km maximum query radius on October 27, 2026.

## Attribution
Aircraft data: FlyItalyADSB (https://flyitalyadsb.com/) — CC BY-SA 4.0.
Map tiles: OpenFreeMap © OpenMapTiles, map data © OpenStreetMap contributors.
Rendering: MapLibre GL JS.

## Important limitations
- The data is not all aircraft and cannot establish that an aircraft is absent from a region.
- Government identification requires a curated and verifiable database; automatic inference from nationality or callsigns would be misleading.
- Flight routes, departure/arrival airports, and aircraft occupants are not supplied by this live position feed.
- This is intended for public aviation observation and research.
