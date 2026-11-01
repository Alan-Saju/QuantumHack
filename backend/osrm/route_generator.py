import math

from backend.models.route import Candidate, Segment


def parse_routes(payload: dict) -> list[Candidate]:
    """Require aligned node annotations; never guess OSM edge identities.

    Source: https://project-osrm.org/docs/v5.24.0/api/#annotation-object
    """
    if payload.get("code") == "NoRoute":
        return []
    if payload.get("code") != "Ok":
        raise ValueError("OSRM route request failed")
    result = []
    for index, raw in enumerate(payload["routes"]):
        segments = []
        for leg in raw["legs"]:
            annotation = leg["annotation"]
            nodes, distances, durations = (annotation[key] for key in ("nodes", "distance", "duration"))
            if not distances or len(nodes) != len(distances) + 1 or len(distances) != len(durations):
                raise ValueError("OSRM annotation arrays do not align")
            if any(type(node) is not int or node <= 0 for node in nodes):
                raise ValueError("Invalid OSM node identifiers")
            segments.extend(Segment(id=f"{a}:{b}", source=a, target=b, distance_m=d, duration_s=t)
                            for a, b, d, t in zip(nodes, nodes[1:], distances, durations))
        candidate = Candidate(id=f"osrm-{index}", distance_m=raw["distance"], duration_s=raw["duration"],
                              geometry=raw["geometry"], segments=segments)
        if not math.isclose(sum(s.distance_m for s in segments), candidate.distance_m, abs_tol=max(2, candidate.distance_m * 0.01)):
            raise ValueError("Route distance disagrees with annotations")
        if sum(s.duration_s for s in segments) > candidate.duration_s + max(2, candidate.duration_s * 0.01):
            raise ValueError("Route duration disagrees with annotations")
        for lon, lat in candidate.geometry.coordinates:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Invalid route geometry")
        result.append(candidate)
    return result
