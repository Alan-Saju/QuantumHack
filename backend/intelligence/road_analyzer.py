import json
import re
from pathlib import Path

from backend.models.route import RoadAttributes


def measurement(raw: str | None, unit: str) -> float | None:
    """Parse explicit metric values only. Ambiguous values stay unknown."""
    if not raw:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:" + unit + r")?\s*", raw)
    value = float(match[1]) if match else 0
    return value if value > 0 else None


class RoadIndex:
    """Directed OSM node pairs, extracted from the same PBF used by OSRM."""

    def __init__(self, edges: dict):
        self.edges = edges

    @classmethod
    def load(cls, path: str | Path):
        return cls(json.loads(Path(path).read_text(encoding="utf-8"))["edges"])

    def lookup(self, segment_id: str) -> RoadAttributes:
        records = self.edges.get(segment_id, [])
        # Parallel ways cannot safely be disambiguated using a node pair alone.
        if len(records) != 1:
            return RoadAttributes()
        record = records[0]
        tags = record["tags"]
        return RoadAttributes(
            matched=True, way_id=record["way_id"], tags=tags,
            direction_allowed=record["direction_allowed"],
            width_m=measurement(tags.get("width"), "m"),
            maxwidth_m=measurement(tags.get("maxwidth"), "m"),
            maxheight_m=measurement(tags.get("maxheight"), "m"),
            maxweight_t=measurement(tags.get("maxweight"), "t"),
        )
