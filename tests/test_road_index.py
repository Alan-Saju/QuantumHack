from backend.intelligence.road_analyzer import RoadIndex, measurement
from scripts.build_road_index import build_index
import pytest


def test_extract_attributes_and_oneway(tmp_path):
    source = tmp_path / "roads.osm"
    source.write_text('''<osm version="0.6">
      <node id="1" lat="9.93" lon="76.26" version="1"/>
      <node id="2" lat="9.94" lon="76.27" version="1"/>
      <way id="10" version="1"><nd ref="1"/><nd ref="2"/>
        <tag k="highway" v="residential"/><tag k="width" v="3.5 m"/>
        <tag k="oneway" v="yes"/><tag k="lanes" v="1"/>
      </way></osm>''', encoding="utf-8")
    output = tmp_path / "index.json"
    assert build_index(source, output) == 2
    roads = RoadIndex.load(output)
    assert roads.lookup("1:2").width_m == 3.5
    assert roads.lookup("1:2").tags["lanes"] == "1"
    assert roads.lookup("1:2").direction_allowed
    assert not roads.lookup("2:1").direction_allowed


def test_ambiguous_and_unparsed_attributes_stay_unknown():
    assert measurement("10 ft", "m") is None
    assert measurement("3;4", "m") is None
    assert measurement("0", "m") is None
    assert measurement("3.5 t", "t") == 3.5
    records = [{"way_id": 1, "tags": {}, "direction_allowed": True}] * 2
    assert not RoadIndex({"1:2": records}).lookup("1:2").matched


def test_invalid_index_records_fail_during_load(tmp_path):
    path = tmp_path / 'broken.json'
    path.write_text('{"edges":{"1:2":[{"way_id":10}]}}')
    with pytest.raises(ValueError):
        RoadIndex.load(path)


def test_bounded_index_keeps_boundary_edges_and_excludes_outside_roads(tmp_path):
    source = tmp_path / 'region.osm'
    source.write_text('''<osm version="0.6">
      <node id="1" lat="9.95" lon="76.30" version="1"/>
      <node id="2" lat="10.20" lon="76.30" version="1"/>
      <node id="3" lat="10.21" lon="76.31" version="1"/>
      <way id="10" version="1"><nd ref="1"/><nd ref="2"/>
        <tag k="highway" v="residential"/><tag k="oneway" v="yes"/>
        <tag k="surface" v="asphalt"/></way>
      <way id="11" version="1"><nd ref="2"/><nd ref="3"/>
        <tag k="highway" v="residential"/></way></osm>''', encoding='utf-8')
    output = tmp_path / 'index.json'
    assert build_index(source, output, bounds=(76.2, 9.85, 76.4, 10.1)) == 2
    roads = RoadIndex.load(output)
    assert roads.lookup('1:2').tags['surface'] == 'asphalt'
    assert not roads.lookup('2:1').direction_allowed
    assert not roads.lookup('2:3').matched


def test_invalid_bounds_do_not_create_an_index(tmp_path):
    output = tmp_path / 'index.json'
    with pytest.raises(ValueError, match='bounds'):
        build_index(tmp_path / 'missing.osm', output, bounds=(77, 10, 76, 9))
    assert not output.exists()
