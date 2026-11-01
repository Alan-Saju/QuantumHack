import json
import re
from pathlib import Path
from typing import Annotated

from pydantic import Field, TypeAdapter

from backend.models.route import Model, RoadAttributes


class RoadRecord(Model):
    way_id: int = Field(gt=0)
    tags: dict[str, str]
    direction_allowed: bool


IndexRecords = TypeAdapter(dict[Annotated[str, Field(pattern=r"^[1-9]\d*:[1-9]\d*$")], list[RoadRecord]])


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
        records = IndexRecords.validate_python(json.loads(Path(path).read_text(encoding="utf-8"))["edges"])
        return cls({key: [record.model_dump() for record in values] for key, values in records.items()})

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
