# Road attributes and implemented allocation cost

Date: 1 November 2026. Status: implemented and locally verified.

## Configuration

The index is extracted from `osrm/data/map.osm.pbf`, the same local Southern
Zone source used by OSRM. The default Kochi box is west 76.20, south 9.85,
east 76.40, north 10.10 degrees. Pairs with at least one endpoint inside
the box are retained in both directions. Other pairs remain unknown; this is
not a complete index of the regional routing graph. An edge that crosses the
box with both endpoints outside it is also omitted.

Rebuild without reprocessing OSRM:

```powershell
.\scripts\start.ps1 -BuildRoadIndex
```

The launcher automatically sets `ROAD_INDEX_PATH` to the generated
`data/road_network/roads.json` when no explicit path is provided. For direct
uvicorn startup, set that environment variable yourself. Restart the backend
after changing the file: the loaded index is cached. Generated data is ignored
by Git. Rebuild both OSRM and the index from the same source after map updates.

All highway way tags are retained, including width, maxwidth, maxheight,
maxweight, oneway, access, vehicle, motor_vehicle, motorcar, surface, lanes,
highway, smoothness and maxspeed when present. Only width and dimension limits
are parsed as simple positive metric values today; other tags remain raw.
Missing, ambiguous and unsupported values remain unknown. No width or
speed is inferred from the road class or lane count.

The route inspector and OSRM allocation use these records for restriction checks
and the shared formula below. Both allocation legs are checked against the
assigned ambulance's dimensions. Synthetic mode uses geometric travel only,
with null road coverage and zero attribute penalties.

## Feasibility before preference

Exclude a candidate before scoring when a known direction/access restriction
is violated, a known closure is present, vehicle width/height/weight exceeds
a parsed limit, or mapped nominal road width is smaller than vehicle width.
Do not trade these violations against faster travel. No emergency exemptions
are assumed. Unknown data is not evidence of compliance. A strict mode may
exclude unknown width; the demo may retain it with visible uncertainty.

OSM width describes a feature's width; it is not proof of usable lane clearance.
Actual clearance depends on traffic, parked vehicles and obstacles. Proposed
clearance scores below are only a research proxy. Barriers, turning clearance,
node restrictions and complex conditional restrictions remain outside the
implemented validator.

## Implemented route cost, in seconds-equivalent

For a feasible route r:

    C(r) = T(r) + 0.5 N(r) + 0.3 S(r) + 0.2 U(r)
    N(r) = sum over edges e of t_e * n_e
    S(r) = sum over edges e of t_e * s_e
    U(r) = sum over edges e of t_e * u_e

T is the OSRM route duration plus any independently modeled additional traffic
delay, including turn time exactly once. t_e is the baseline OSRM edge duration.
Use OSRM's modeled duration as the starting point; do not also add road-class,
maxspeed or surface-based speed estimates that duplicate its profile.
Surface here expresses a separate comfort/suitability preference, not a second
ETA prediction or a measured medical risk probability.

- n_e: for known nominal width w and vehicle width W,
  `clip(1 - (w - W)/1.0m, 0, 1)`. A nominal extra width of at least one metre
  has zero narrowness penalty. If width is unknown, n_e is zero and the missing
  information is charged through U instead. The one-metre target is a tunable
  demo assumption, not a recommended ambulance clearance standard.
- s_e: 0 for asphalt/concrete/paved, 0.25 for paving_stones/sett,
  0.5 for gravel/fine_gravel/compacted/unpaved, and 1 for
  ground/dirt/earth/sand/mud. Other or missing values contribute zero here and
  are marked unknown in U. These values are proposed preferences, not measured
  delay factors or authoritative classifications of passability.
- u_e: `0.7 * unknown_width + 0.3 * unknown_surface`, between zero and one.
  No unique OSM match makes both unknown. Report unparsed access/dimension
  restrictions separately; this uncertainty score only covers width/surface.

The 0.5/0.3/0.2 coefficients are initial experimental settings. Calibrate them
using observed routes and operator feedback before drawing operational
conclusions. Weighting by time exposure replaces the previous fixed 30 seconds
per unknown-width edge, which changes when an equivalent road is split into
more graph edges. The tests verify this invariance.

Example: T=600 seconds, N=120 seconds, S=100 seconds and U=200 seconds gives
C=730 seconds-equivalent. Display the ETA as 600 seconds and the suitability
score separately; the score is not a 730-second arrival prediction.

Traffic should affect T once. The separate congestion weight should remain
zero by default. Preserve explicit synthetic/live source labels.

## Integrating with joint allocation and QUBO

For a compatible ambulance a, incident i and hospital h, select feasible road
candidates for both legs, then use:

    c_aih = severity_i * C(response_leg)/60
            + transport_weight * C(transport_leg)/60

This keeps the existing minutes-equivalent allocation units. Recompute the
unserved coefficient M and resource-conflict penalty P from these updated costs
using the existing bounds; do not reuse constants from an earlier scenario.
Represent unserved incidents explicitly. The severity rule remains synthetic.

Implemented: positive ambulance dimensions in allocation inputs, road-index
loading for OSRM requests, independent validation of each candidate leg,
per-leg cost breakdowns and unknown coverage, and the same revised costs
for full exact, reduced exact and QAOA models. Synthetic estimates remain separate.

For the first integration, choose the lowest-cost feasible OSRM candidate for
each leg. Alternative routes as separate QUBO variables can follow later.
This ranks returned candidates; it does not find a global shortest path under
the proposed custom costs.

## Sources

- OSM width: https://wiki.openstreetmap.org/wiki/Key:width
- OSM surface: https://wiki.openstreetmap.org/wiki/Key:surface
- Current scoring: `backend/intelligence/cost_calculator.py`
- Current feasibility: `backend/optimization/route_validator.py`
- Current allocation coefficients: `backend/allocation/qubo.py`

OSM documents tag meanings; it does not prescribe the proposed formula,
coefficients, margin or severity policy.

## Initial configuration verification (before cost implementation)

The generated index contains 365,278 directed pairs and occupies 56,643,030
bytes. Of 365,270 unique pairs, 7,962 have a width tag (about 2.2%) and 89,856
have a surface tag (about 24.6%). These are tag-presence counts, not assurances
of parsable measurements or safe roads.

After restarting the API on port 8000 with `ROAD_INDEX_PATH` set, readiness
reports `osrm: available` and `road_attributes: loaded`. The request in
`examples/route-request.json` produces one candidate with 68/68 uniquely
matched segments and 68/68 surface tags, compared with 0/68 matched segments
before configuration. None has parsed width. With `require_known_width: true`,
the API returns `no_feasible_route`; permissive mode retains explicit warnings.
The allocation demo endpoint remains available with its synthetic default.

All 57 backend tests and the generated-contract check pass. Launcher syntax
and whitespace checks pass. A deliberate boundary-filter mutation was caught
by the new extraction test and restored; the extraction tests pass afterward.
No frontend source or scoring coefficients were changed in this task.

## Cost implementation verification

The shared scorer now computes the formula above. Legacy route API suitability
and risk weights multiply the narrowness/surface penalties; an additional
uncertainty weight defaults to one. Disabling a legacy width/surface scoring
option also disables that attribute's contribution to uncertainty, while known
restriction checks remain active. Allocation uses the default coefficients.

Both response and hospital legs return `leg_details` with separate `cost`,
`road_coverage`, geometry and summarized warnings. `response_minutes` and
`transport_minutes` remain travel times; assignment `cost` includes preferences
and is measured in minutes-equivalent. Vehicle dimensions are included in the
scored-leg cache key; raw OSRM candidates can be reused across vehicles without
reusing another vehicle's feasibility result. NoSegment and NoRoute remove
choices; upstream failures remain errors. Unserved and QUBO penalties are
recomputed after road-aware choices are built.

The UI exposes ambulance dimensions, strict width and simulated traffic options,
and per-leg cost/coverage disclosures. The route inspector enables the new road
preferences by default while leaving simulated traffic off. API closures use
`road_scenario.overrides` and remain hard exclusions even with traffic off.

All 71 backend tests, 13 frontend tests, generated contracts, frontend build,
and isolated route/mock/GPS/allocation browser suites pass. A live OSRM/QAOA
request with the configured index served all three incidents at selected/exact
objective 51.9153416667 minutes-equivalent. Actual-road browser checks on desktop
and mobile showed cost breakdowns without page errors; strict width left all
three incidents unserved because width was unknown. Screenshots and the full
live result are in ignored `frontend/test-results/`. The coefficients remain
experimental and no quantum advantage is claimed.
