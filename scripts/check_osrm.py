"""Exercise the local Route, Nearest and Table services with Kochi coordinates."""
import argparse
import json

import httpx

from backend.models.route import Location
from backend.osrm.client import OSRMClient


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:5000")
    args = parser.parse_args()
    start = Location(latitude=9.9312, longitude=76.2673)
    end = Location(latitude=9.95, longitude=76.29)
    with httpx.Client(timeout=30, trust_env=False) as http:
        client = OSRMClient(http, args.url)
        nearest = client.nearest(start)
        routes = client.routes(start, end)
        table = client.table(start, end)
    if not routes or not nearest.get("waypoints") or not table.get("durations"):
        raise SystemExit("OSRM did not return the required smoke-test results")
    print(json.dumps({"candidate_count": len(routes), "nearest": nearest["waypoints"][0],
                      "table_durations_s": table["durations"]}, indent=2))


if __name__ == "__main__":
    main()
