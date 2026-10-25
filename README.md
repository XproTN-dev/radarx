# RadarX — Gulf Aviation Tracker

RadarX is a free browser-based aircraft map, designed with a light aviation-radar layout. It is an independent app and does not copy Flightradar24 branding or proprietary code.

## V0.5 capabilities
- Qatar-centered closer default map (7.25 zoom), redesigned compact navigation and controls, and OpenFreeMap Bright via MapLibre GL JS
- Quick switcher for Qatar, Bahrain, UAE, Kuwait, Oman and eastern Saudi Arabia
- Public aircraft observations from FlyItalyADSB via a Cloudflare Worker
- Native GeoJSON map layers for aircraft positions (not HTML markers), fixed geographic pinning through zooming/panning, automatic label collision detection, aircraft list, filtering, search, details, and mobile interface
- Military aircraft identified via the source's dbFlags military bit
- Government filter is intentionally empty until independently verified identities are incorporated
- Positions can be incomplete or delayed. Other/unverified is not equivalent to confirmed civilian.
- Query around Doha by default (250 nautical miles), switching regions changes the query center. Pan and use Search this area to look elsewhere.
- Large-scale zoomed-out maps may show aircraft clustered near one longitude because the live feed only covers a small geographic radius; zoom in or select a region to inspect them. This is expected geographic compression, not global coverage.
- Aircraft are polled every 30 seconds while the page is open and visible; source/relay caching can delay updates further.
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

The frontend calls /v1/near?lat=25.7200&lon=51.5300&dist=250. Distance in the Worker endpoint is nautical miles, and the Worker converts it to km for the upstream FlyItalyADSB provider.

Keep the private FlyItalyADSB key in Cloudflare as a Worker secret named FLYITALY_API_KEY. NEVER add a key to GitHub, HTML, or JavaScript.

The current Cloudflare Worker is shared publicly. Before inviting large numbers of users, add server-side request throttling and coarser regional cache keys to avoid exhausting the upstream free quota. As documented in October 2026, the provider free plan changes to 30 requests/minute, 300,000/month and 500 km maximum query radius on October 27, 2026.

## Attribution
Aircraft data: FlyItalyADSB (https://flyitalyadsb.com/) — CC BY-SA 4.0.
Map tiles: OpenFreeMap © OpenMapTiles, map data © OpenStreetMap contributors.
Rendering: MapLibre GL JS.

## Design and usage notes
- Select a region from the top bar. The selected region controls what is fetched; panning alone does not incur additional API calls until Search this area is pressed.
- A flight marker can be selected to see details; the Reset view button returns to Qatar at a closer zoom.
- The sidebar is collapsible on phones; use the menu icon.
- Labels appear on a more detailed desktop zoom to avoid clutter.

## Important limitations
- The data is not all aircraft and cannot establish that an aircraft is absent from a region.
- Government identification requires a curated and verifiable database; automatic inference from nationality or callsigns would be misleading.
- Flight routes, departure/arrival airports, and aircraft occupants are not supplied by this live position feed.
- This is intended for public aviation observation and research.

## V0.3 rendering fix (2026-10-25)
Aircraft positions are now rendered with MapLibre GL JS native GeoJSON symbol layers. Prior versions rendered aircraft using MapLibre DOM Markers, which were reported to drift visually while zooming. The aircraft symbols and callsigns are pinned to the map engine's geographic projection; symbols are restored whenever a base map style is changed. Reload the site to fetch the new app.js?v=0.3.0.

## V0.3.1 stability diagnostic (October 25, 2026)
- Aircraft icon size is fixed rather than interpolated with zoom; map bearing and pitch are locked to a flat north-up map.
- Selecting a plane shows a separate blue geographic anchor ring drawn from the same GeoJSON point by MapLibre's circle renderer, enabling an exact visual check for relative movement.
- The aircraft detail panel shows received GPS latitude and longitude. Coordinates stay unchanged while zooming unless new API observations arrive.
- RadarX polling now runs every 30 seconds while the tab is visible (as of V0.5.1), so real movement can occur when new data arrives. Zoom events do not fetch aircraft data.
- A geographic point legitimately changes its position in screen pixels when the map zooms or pans; it must not change which ground coordinate it is attached to.
- User's latest supplied recording was only 34x34 pixels when decoded, so independent visual confirmation of the reported drift was not possible from it.

## V0.4 data coverage and zoom diagnostic (25 October 2026)
- Added **Freeze positions** button that holds the current aircraft snapshot, including protection against an HTTP request that was already in flight. Zoom and pan do not change the captured GPS coordinates. Press **Resume live** to get updated data.
- The age in the status card now uses the upstream `now` timestamp where provided (instead of labeling each cached browser response as fresh). If that timestamp is missing it displays **unknown**; 3+ minute samples are flagged as delayed.
- Search radius was widened from 180 NM to 250 NM (about 463 km), below the provider's documented 500 km free-plan limit. This does **not** add receiver coverage or guarantee more aircraft.
- **FR24 parity is not expected:** FR24 uses its own ADS-B/MLAT/satellite network and scheduled flight data, while RadarX currently uses only FlyItalyADSB. Some government or military aircraft intentionally hidden on FR24 may appear on other ADS-B networks, and vice versa. Comparing aircraft requires matching the same UTC time, geographic extent, and ICAO hex identifier.
- Aircraft **screen pixels** necessarily move when zooming a geographically anchored map. Their reported **latitude/longitude** and position relative to the coastline should stay fixed during Freeze mode.
- A position can jump when a new cached sample is received after resuming; smoother interpolation is not yet implemented.
- API keys remain stored as Cloudflare secrets; never expose them in GitHub.

## V0.5 changes (October 25, 2026)
- Community aircraft reference lookup from SDR Enthusiasts' Plane Alert DB, ODbL 1.0, via browser-accessible raw CSV.
- Enriched operator/category labels where the community registry contains a matching ICAO identifier; these are not independently verified.
- Persistent browser-only favourites and supplementary airborne, visible-map and favourites filters.
- Four OpenFreeMap basemap styles: Bright, Liberty, Positron, Dark.
- Aggregate aircraft-count mini chart for observations during the current browser session (not archived traffic history).
- Added separate radarx code-check workflow for JavaScript syntax and web asset references.
- All features preserve the existing Cloudflare worker URL and never expose the private FlyItalyADSB API key.
- The real browser runtime, CSV availability, and new controls still require visual and functional testing.

## Not yet delivered
- FlyItalyADSB historical aircraft API access and full historical playback. The existing Cloudflare Worker supports only the nearby-aircraft endpoint.
- Shared backend rate limiting/usage monitoring. GitHub Pages cannot update Cloudflare Worker code.
- Multi-provider deduplication; access to additional approved data feeds must be arranged separately.
- Aircraft photographs: embedding photos requires permission; linkouts should be checked before integration.
- Query-boundary overlay and airports: planned but not in this version.
- End-to-end browser/mobile acceptance testing and true Flightradar24 data parity.

## Data and licensing
- Aircraft positions: FlyItalyADSB, CC BY-SA 4.0; show source attribution and honor the API plan.
- Aircraft classifications: plane-alert-db contributors, ODbL 1.0; community classifications may be outdated or inaccurate.
- The community registry is fetched directly in the browser, so it may be unavailable on networks that restrict GitHub raw content.
- RadarX is not a comprehensive real-time airspace surveillance system.

## Near-live polling — V0.5.1 (2026-10-25)
- Browser now checks the shared Cloudflare endpoint approximately every 30 seconds while the tab is visible (5-second freshness display updates); respects Freeze and avoids rapid retry loops on network failures.
- The current Cloudflare Worker from an earlier manual deployment **still caches responses for 90 seconds**. To achieve substantially fresher data, its TTL must be changed by the Cloudflare account owner. The GitHub website alone cannot change Cloudflare's cache.
- At 30 seconds per cache miss per active region, a continuously requested region could require approximately 86,400 upstream requests over 30 days. The free provider plan has 300,000/month and 30/minute per key beginning October 27, 2026. Cloudflare caches can be geographically separate, and multiple simultaneously requested regions increase usage. The provider has no WebSocket stream; its snapshot is rewritten every 2 seconds and its API reloads every ~3 seconds.
- **Terms check:** FlyItalyADSB explicitly permits a cached server supporting its own app users but restricts standalone public real-time forwarding of its API responses without an enterprise agreement. Our public Worker must remain application-specific rather than a general data relay; seek clarification before distributing the raw Worker endpoint or inviting broad public traffic.
- Source age uses the feed's `now` field, not the time the browser received the response. Stale samples must never be described as live.
