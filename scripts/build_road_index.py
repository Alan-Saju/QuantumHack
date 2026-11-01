"""Extract directed node-pair attributes from the OSRM source OSM/PBF file."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import osmium


class RoadHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.edges = defaultdict(list)

    def way(self, way):
        if "highway" not in way.tags:
            return
        tags = dict(way.tags)
        nodes = [node.ref for node in way.nodes]
        oneway = tags.get("oneway")
        forward_only = oneway in {"yes", "1", "true"} or (
            oneway is None and (tags.get("junction") == "roundabout" or tags.get("highway") == "motorway"))
        for a, b in zip(nodes, nodes[1:]):
            for source, target, allowed in ((a, b, oneway != "-1"), (b, a, not forward_only)):
                self.edges[f"{source}:{target}"].append({"way_id": way.id, "tags": tags,
                                                        "direction_allowed": allowed})


def build_index(source: Path, output: Path):
    handler = RoadHandler()
    handler.apply_file(str(source))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source": source.name, "edges": handler.edges}), encoding="utf-8")
    return len(handler.edges)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    count = build_index(args.source, args.output)
    print(f"Extracted {count} directed node pairs to {args.output}")
