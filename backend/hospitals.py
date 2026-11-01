"""Local OSM hospital catalogue. It contains locations, not clinical availability."""
import json
from pathlib import Path

from pydantic import Field

from backend.models.route import Location, Model


class HospitalPlace(Location):
    id: str = Field(pattern=r'^(node|way|relation)-[0-9]+$')
    name: str = Field(min_length=1, max_length=80)


class HospitalDirectory(Model):
    source_file: str
    generated_at: str
    hospitals: list[HospitalPlace]

    @classmethod
    def load(cls, path: Path):
        return cls.model_validate(json.loads(path.read_text(encoding='utf-8')))


class HospitalSearch(Model):
    hospitals: list[HospitalPlace]
    truncated: bool
    source: str = 'OpenStreetMap local extract'
    indexed_at: str


class HospitalIndexError(Exception):
    pass
