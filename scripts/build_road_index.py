"""Extract directed node-pair attributes from the OSRM source OSM/PBF file."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import osmium


class BoundsNodes(osmium.SimpleHandler):
    def __init__(self, bounds):
        super().__init__()
        self.bounds = bounds
        self.ids = set()

    def node(self, node):
        west, south, east, north = self.bounds
        if node.location.valid() and west <= node.location.lon <= east and south <= node.location.lat <= north:
            self.ids.add(node.id)


class RoadHandler(osmium.SimpleHandler):
    def __init__(self, node_ids=None):
        super().__init__()
        self.edges = defaultdict(list)
        self.node_ids = node_ids

    def way(self, way):
        if "highway" not in way.tags:
            return
        tags = dict(way.tags)
        nodes = [node.ref for node in way.nodes]
        oneway = tags.get("oneway")
        forward_only = oneway in {"yes", "1", "true"} or (
            oneway is None and (tags.get("junction") == "roundabout" or tags.get("highway") == "motorway"))
        for a, b in zip(nodes, nodes[1:]):
            if self.node_ids is not None and a not in self.node_ids and b not in self.node_ids:
                continue
            for source, target, allowed in ((a, b, oneway != "-1"), (b, a, not forward_only)):
                self.edges[f"{source}:{target}"].append({"way_id": way.id, "tags": tags,
                                                        "direction_allowed": allowed})


def build_index(source: Path, output: Path, bounds=None):
    node_ids = None
    if bounds is not None:
        if (len(bounds) != 4 or not all(math.isfinite(v) for v in bounds)
                or not -180 <= bounds[0] < bounds[2] <= 180
                or not -90 <= bounds[1] < bounds[3] <= 90):
            raise ValueError('Invalid bounds: use west south east north in degrees')
        nodes = BoundsNodes(bounds)
        nodes.apply_file(str(source))
        node_ids = nodes.ids
    handler = RoadHandler(node_ids)
    handler.apply_file(str(source))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump({"source": source.name, "bounds": bounds, "edges": handler.edges}, stream)
    temporary.replace(output)
    return len(handler.edges)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument('--bounds', nargs=4, type=float, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'),
                        help='Index pairs with at least one endpoint in this box; outside pairs remain unknown')
    args = parser.parse_args()
    count = build_index(args.source, args.output, args.bounds)
    print(f"Extracted {count} directed node pairs to {args.output}")
