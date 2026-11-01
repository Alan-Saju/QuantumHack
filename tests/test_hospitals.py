import json

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from scripts.build_hospital_index import build_index


def test_extracts_hospital_nodes_ways_and_relations_without_clinics(tmp_path):
    source = tmp_path / 'places.osm'
    source.write_text('''<osm version="0.6">
      <node id="1" lat="9.94" lon="76.28"><tag k="amenity" v="hospital"/><tag k="name" v="Hospital A"/></node>
      <node id="2" lat="9.95" lon="76.29"/>
      <node id="3" lat="9.96" lon="76.30"/>
      <node id="4" lat="9.97" lon="76.31"><tag k="amenity" v="clinic"/></node>
      <node id="5" lat="14" lon="78"><tag k="amenity" v="hospital"/></node>
      <way id="10"><nd ref="2"/><nd ref="3"/><tag k="healthcare" v="hospital"/><tag k="name" v="Hospital B"/></way>
      <way id="11"><nd ref="1"/><nd ref="2"/></way>
      <relation id="20"><member type="way" ref="11" role="outer"/><tag k="amenity" v="hospital"/><tag k="name" v="Hospital C"/></relation>
    </osm>''', encoding='utf-8')
    output = tmp_path / 'hospitals.json'
    assert build_index(source, output) == 3
    data = json.loads(output.read_text())
    assert {h['id'] for h in data['hospitals']} == {'node-1', 'way-10', 'relation-20'}
    assert data['source_file'] == 'places.osm'


def test_viewport_filters_real_catalogue_and_reports_truncation(tmp_path, monkeypatch):
    path = tmp_path / 'hospitals.json'
    path.write_text(json.dumps({'source_file': 'test.osm.pbf', 'generated_at': '2026-11-01T00:00:00Z', 'hospitals': [
        {'id': 'node-1', 'name': 'Hospital A', 'latitude': 9.94, 'longitude': 76.28},
        {'id': 'way-2', 'name': 'Hospital B', 'latitude': 10.5, 'longitude': 76.3}]}))
    monkeypatch.setenv('HOSPITAL_INDEX_PATH', str(path))
    main.get_hospital_directory.cache_clear()
    try:
        with TestClient(main.app) as client:
            response = client.get('/api/hospitals?south=9.9&west=76.2&north=10&east=76.4')
            assert response.status_code == 200
            assert [h['id'] for h in response.json()['hospitals']] == ['node-1']
            assert response.json()['truncated'] is False
            assert client.get('/api/hospitals?south=9&west=76&north=11&east=77&limit=1').json()['truncated'] is True
            for query in ['south=10&west=76&north=9&east=77', 'south=nan&west=76&north=10&east=77',
                          'south=9&west=77&north=10&east=76']:
                assert client.get('/api/hospitals?' + query).status_code == 422
    finally:
        main.get_hospital_directory.cache_clear()


def test_missing_catalogue_reports_unavailable_instead_of_demo_hospitals(tmp_path, monkeypatch):
    monkeypatch.setenv('HOSPITAL_INDEX_PATH', str(tmp_path / 'missing.json'))
    main.get_hospital_directory.cache_clear()
    try:
        with TestClient(main.app) as client:
            response = client.get('/api/hospitals?south=9&west=76&north=10&east=77')
            assert response.status_code == 503
            assert response.json()['error']['code'] == 'HOSPITAL_INDEX_UNAVAILABLE'
    finally:
        main.get_hospital_directory.cache_clear()
