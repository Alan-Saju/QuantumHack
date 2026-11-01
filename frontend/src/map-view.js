// Leaflet API: https://leafletjs.com/reference.html (GeoJSON, markers, fitBounds).
import { KERALA_BOUNDS, constrainMap } from './operating-area.js';
import { createHospitalPicker } from './hospital-picker.js';
export function createMap(config, onPick, onSelect, onHospitalSelect) {
  const map = L.map('map', { zoomControl: false }).setView([9.944, 76.28], 13);
  const area = constrainMap(map, config.operating_bounds ?? KERALA_BOUNDS);
  const hospitals = createHospitalPicker(map, onHospitalSelect);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
  const attribution = document.createElement('span');
  attribution.textContent = config.tile_attribution;
  const credit = `${attribution.innerHTML} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Map licence</a>`;
  const tiles = L.tileLayer(config.tile_url, { maxZoom: 19, bounds: area, attribution: credit }).addTo(map);
  const tileStatus = document.querySelector('#tile-status');
  let failedTiles = 0;
  let loadedTiles = 0;
  tiles.on('loading', () => { failedTiles = 0; loadedTiles = 0; });
  tiles.on('tileerror', () => { failedTiles++; });
  tiles.on('tileload', () => { loadedTiles++; });
  tiles.on('load', () => {
    tileStatus.hidden = failedTiles === 0;
    tileStatus.textContent = loadedTiles === 0
      ? 'Background map tiles are unavailable. Check your internet connection. Local route geometry can still be displayed.'
      : 'Some background map tiles could not load. Try moving or zooming the map.';
  });
  const markers = L.featureGroup().addTo(map);
  const routes = L.featureGroup().addTo(map);
  const routeLayers = new Map();
  let selectedPoint = 'origin';
  let focusedLocation = null;
  const panel = document.querySelector('.sidebar');
  map.on('click', event => onPick(selectedPoint, [event.latlng.lat, event.latlng.lng]));

  function padding() {
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const bounds = panel.getBoundingClientRect();
    return mobile ? { paddingTopLeft: [35, 100], paddingBottomRight: [55, bounds.height + 55] }
      : { paddingTopLeft: [bounds.right + 40, 100], paddingBottomRight: [80, 65] };
  }
  function focus(location) {
    focusedLocation = location;
    // Offset the point into the visible map area beside/above the floating planner.
    const { paddingTopLeft: topLeft, paddingBottomRight: bottomRight } = padding();
    const zoom = Math.max(map.getZoom(), 16);
    const offset = L.point((bottomRight[0] - topLeft[0]) / 2, (bottomRight[1] - topLeft[1]) / 2);
    const center = map.unproject(map.project(location, zoom).add(offset), zoom);
    map.setView(center, zoom, { animate: false });
  }
  function fit() {
    focusedLocation = null;
    const bounds = routes.getLayers().length ? routes.getBounds() : markers.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { ...padding(), maxZoom: 16, animate: false });
  }
  new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (focusedLocation) focus(focusedLocation);
    else fit();
  }).observe(document.querySelector('#map'));
  new ResizeObserver(() => {
    if (focusedLocation) focus(focusedLocation);
    else fit();
  }).observe(panel);

  function style(route, selected) {
    return { color: selected ? '#69b9f0' : '#929aa0',
      weight: selected ? 6 : 4, opacity: selected ? 1 : 0.7,
      dashArray: route.feasible ? null : '7 7' };
  }

  return {
    chooseHospital() { hospitals.open(); },
    pick(point) {
      selectedPoint = point;
      document.querySelector('#map-instruction').textContent = point === 'origin'
        ? 'Click the map to place A · ambulance location'
        : point === 'incident' ? 'Click the map to place B · incident location'
          : 'Click the map to place C · hospital location';
    },
    updateMarkers(origin, incident, destination) {
      markers.clearLayers();
      for (const [point, location, letter] of [['origin', origin, 'A'], ['incident', incident, 'B'], ['destination', destination, 'C']]) {
        if (!location) continue;
        L.marker(location, { draggable: true, title: `${letter}: ${point}`, alt: `${letter}: ${point}`,
          icon: L.divIcon({ html: letter, className: `map-marker ${point}`, iconSize: [32, 32], iconAnchor: [16, 16] }) })
          .on('dragend', event => { const p = event.target.getLatLng(); onPick(point, [p.lat, p.lng]); })
          .on('click', event => { L.DomEvent.stopPropagation(event); focus(location); })
          .addTo(markers);
      }
    },
    clear() { routes.clearLayers(); routeLayers.clear(); },
    show(candidates, selectedId) {
      this.clear();
      for (const route of candidates) {
        const layer = L.geoJSON(route.geometry, { style: style(route, route.id === selectedId) })
          .on('click', event => { L.DomEvent.stopPropagation(event); onSelect(route.id); })
          .addTo(routes);
        routeLayers.set(route.id, { layer, route });
      }
      this.select(selectedId);
      if (focusedLocation) focus(focusedLocation);
      else this.fit();
    },
    select(id) {
      for (const [key, { layer, route }] of routeLayers) layer.setStyle(style(route, key === id));
      routeLayers.get(id)?.layer.bringToFront();
    },
    fit,
    focus,
  };
}
