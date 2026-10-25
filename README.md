# RadarX — Gulf Aviation Tracker

RadarX is a free browser-based aircraft map, designed with a light aviation-radar layout. It is an independent app and does not copy Flightradar24 branding or proprietary code.

## V0.3 capabilities
- Qatar-centered closer default map (7.25 zoom), redesigned compact navigation and controls, and OpenFreeMap Bright via MapLibre GL JS
- Quick switcher for Qatar, Bahrain, UAE, Kuwait, Oman and eastern Saudi Arabia
- Public aircraft observations from FlyItalyADSB via a Cloudflare Worker
- Native GeoJSON map layers for aircraft positions (not HTML markers), fixed geographic pinning through zooming/panning, automatic label collision detection, aircraft list, filtering, search, details, and mobile interface
- Military aircraft identified via the source's dbFlags military bit
- Government filter is intentionally empty until independently verified identities are incorporated
- Positions can be incomplete or delayed. Other/unverified is not equivalent to confirmed civilian.
- Query around Doha by default (180 nautical miles), switching regions changes the query center. Pan and use Search this area to look elsewhere.
- Large-scale zoomed-out maps may show aircraft clustered near one longitude because the live feed only covers a small geographic radius; zoom in or select a region to inspect them. This is expected geographic compression, not global coverage.
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
- Refreshing is still on a 120-second interval while the tab is visible, so real movement can occur when new data arrives. Zoom events do not fetch aircraft data.
- A geographic point legitimately changes its position in screen pixels when the map zooms or pans; it must not change which ground coordinate it is attached to.
- User's latest supplied recording was only 34x34 pixels when decoded, so independent visual confirmation of the reported drift was not possible from it.
