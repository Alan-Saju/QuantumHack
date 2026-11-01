"""Extract hospital locations from the local OSM/PBF using small targeted passes."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import osmium

from backend.models.geography import in_operating_area


def hospital(tags):
    return tags.get('amenity') == 'hospital' or tags.get('healthcare') == 'hospital'


class Places(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.points, self.ways, self.relations = [], {}, {}

    def node(self, node):
        if hospital(node.tags) and node.location.valid():
            self.points.append({'id': f'node-{node.id}', 'name': str(node.tags.get('name') or node.tags.get('name:en') or 'Unnamed hospital')[:80],
                                'latitude': node.location.lat, 'longitude': node.location.lon})

    def way(self, way):
        if hospital(way.tags):
            self.ways[way.id] = (str(way.tags.get('name') or way.tags.get('name:en') or 'Unnamed hospital')[:80],
                                 [node.ref for node in way.nodes])

    def relation(self, relation):
        if hospital(relation.tags):
            self.relations[relation.id] = (str(relation.tags.get('name') or relation.tags.get('name:en') or 'Unnamed hospital')[:80],
                                           [member.ref for member in relation.members if member.type == 'w' and member.role in ('outer', '')])


class MemberWays(osmium.SimpleHandler):
    def __init__(self, ids):
        super().__init__()
        self.ids, self.nodes = ids, {}

    def way(self, way):
        if way.id in self.ids:
            self.nodes[way.id] = [node.ref for node in way.nodes]


class Positions(osmium.SimpleHandler):
    def __init__(self, ids):
        super().__init__()
        self.ids, self.points = ids, {}

    def node(self, node):
        if node.id in self.ids and node.location.valid():
            self.points[node.id] = (node.location.lat, node.location.lon)


def build_index(source: Path, output: Path):
    places = Places()
    places.apply_file(str(source), filters=[osmium.filter.TagFilter(('amenity', 'hospital'), ('healthcare', 'hospital'))])
    member_ids = {way for _, ways in places.relations.values() for way in ways}
    members = MemberWays(member_ids)
    if member_ids:
        members.apply_file(str(source), filters=[osmium.filter.IdFilter(member_ids)])
    areas = [(f'way-{key}', name, nodes) for key, (name, nodes) in places.ways.items() if key not in member_ids]
    areas += [(f'relation-{key}', name, [node for way in ways for node in members.nodes.get(way, [])])
              for key, (name, ways) in places.relations.items()]
    positions = Positions({node for _, _, nodes in areas for node in nodes})
    if positions.ids:
        positions.apply_file(str(source), filters=[osmium.filter.IdFilter(positions.ids)])
    for identifier, name, nodes in areas:
        coordinates = [positions.points[node] for node in set(nodes) if node in positions.points]
        if not coordinates:
            continue
        places.points.append({'id': identifier, 'name': name,
                              'latitude': round(sum(p[0] for p in coordinates) / len(coordinates), 7),
                              'longitude': round(sum(p[1] for p in coordinates) / len(coordinates), 7)})
    hospitals = sorted((p for p in places.points if in_operating_area(p['latitude'], p['longitude'])),
                       key=lambda p: (p['name'].casefold(), p['id']))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps({'source_file': source.name, 'generated_at': datetime.now(timezone.utc).isoformat(),
                                     'hospitals': hospitals}, ensure_ascii=False), encoding='utf-8')
    temporary.replace(output)
    return len(hospitals)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(f'Indexed {build_index(args.source, args.output)} hospital locations from OpenStreetMap.')
