"""Run the classical pipeline with explicitly synthetic routes and road data."""
import json
from pathlib import Path

from backend.intelligence.road_analyzer import RoadIndex
from backend.models.route import RouteRequest, Scenario
from backend.optimization.classical_optimizer import optimize
from backend.osrm.route_generator import parse_routes

ROOT = Path(__file__).resolve().parents[1]


def main():
    candidates = parse_routes(json.loads((ROOT / "examples/osrm-demo-response.json").read_text()))
    roads = RoadIndex.load(ROOT / "data/road_network/demo.json")
    request = RouteRequest(
        ambulance={"latitude": 9.9312, "longitude": 76.2673},
        emergency={"latitude": 9.932, "longitude": 76.2691},
        scenario=Scenario(overrides={key: "low" for key in roads.edges}),
    )
    initial = optimize(candidates, roads, request)
    request.scenario.overrides["1:2"] = "blocked"
    rerouted = optimize(candidates, roads, request)
    print(json.dumps({"data_source": "synthetic offline demonstration",
                      "initial_route": initial.classical_route.id,
                      "initial_time_s": initial.classical_route.estimated_time_s,
                      "after_blocking_1:2": rerouted.classical_route.id,
                      "rerouted_time_s": rerouted.classical_route.estimated_time_s,
                      "blocked_baseline_returned_as_fallback": rerouted.fallback_route is not None}, indent=2))


if __name__ == "__main__":
    main()
