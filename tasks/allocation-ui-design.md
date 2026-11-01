# Allocation dashboard design contract

Scope: dashboard and map presentation; preserve allocation rules, API requests,
manual coordinates, fixed hospital networks and genuine solver results.

Evidence: inspected live 1440 x 960 dashboard and existing mobile screenshots.
The current page is 2619px tall, map is only 480px high, coordinates are squeezed
into horizontal labels, action visibility depends on scroll, and results have
no useful initial guidance. Retain the existing teal identity and Leaflet map.

Direction: a dispatch workstation with a persistent action and map-first layout.
No marketing headline. Header identifies the workspace; scenario counts are live
resource summaries, not decorative KPIs. Desktop uses a scrollable scenario rail
and a map with a results drawer beneath it. Mobile stacks map and configuration,
with a persistent optimize action. Avoid adding an independent right column that
would make the map too narrow at 1024px.

Tokens: ink #193b35, secondary #526862, action #006e60, hospital #355a8a,
incident #ad481e, surface #ffffff, canvas #edf2ef, border #dce6e0.
Type: locally available Segoe UI Variable / Segoe UI for operator controls,
with tabular numeric values; 12/13/14/18px functional hierarchy.
Geometry: 4/8px spacing scale, 6px controls, 10px map surface, subtle structural
borders. Distinct vehicle/cross/incident SVG glyphs plus resource ids. No remote
font dependencies or map tiles substituted with pretend road data.

Required states: loading, ready, dirty scenario, computing, results, partial
allocation, missing endpoint, unavailable basemap, unavailable quantum solver.
Map exploration must not place a resource; explicit placement mode must identify
the selected resource. Resource counts and solver labels must use current data.
Coordinates remain a keyboard alternative. All click targets are native controls.

Verification: existing allocation browser flow plus exploration/placement,
results expansion/inspection, responsive 320/768/1024/1440 layouts, keyboard focus,
no page errors and no horizontal overflow. Inspect screenshots before delivery.

## Implemented UI finish

The dashboard now fits a desktop viewport with an independent scenario scroll
rail and persistent allocation action. The mobile action is fixed to the bottom
of the viewport. Live availability counts reflect the current scenario.
Resource groups and advanced solver parameters use native disclosures. The map
has resource shortcuts, an explicit placement/exploration mode, distinctive local
SVG glyphs, scale/fit controls, selection rings, and a basemap failure message.
Allocation rows can focus their two route legs; fitting resources restores the
full plan. Desktop dispatches sit alongside each other; narrow layouts stack.

Verified: frontend build, all 13 frontend unit tests, existing route/mock/GPS
browser integration and the allocation flow. Allocation checks cover 320, 768,
1024 and 1440px widths; visible primary actions; native keyboard activation;
click/drag/typed locations; three/five fixed hospitals; real QAOA; allocation
inspection; offline basemap; and missing endpoints. Actual OSM tiles were loaded
against the running local server for the final screenshot review. No solver,
resource rules, API payloads, or dependency versions changed in this UI work.
