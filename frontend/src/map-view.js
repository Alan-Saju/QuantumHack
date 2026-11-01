// Leaflet API: https://leafletjs.com/reference.html (GeoJSON, markers, fitBounds).
export function createMap(config, onPick, onSelect) {
  const map = L.map('map', { zoomControl: false }).setView([9.944, 76.28], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
  const attribution = document.createElement('span');
  attribution.textContent = config.tile_attribution;
  const credit = `${attribution.innerHTML} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Map licence</a>`;
  const tiles = L.tileLayer(config.tile_url, { maxZoom: 19, attribution: credit }).addTo(map);
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
  map.on('click', event => onPick(selectedPoint, [event.latlng.lat, event.latlng.lng]));

  function fit() {
    const bounds = routes.getLayers().length ? routes.getBounds() : markers.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 80], maxZoom: 16, animate: false });
  }
  new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    fit();
  }).observe(document.querySelector('#map'));

  function style(route, selected) {
    return { color: route.feasible ? (selected ? '#006e60' : '#758f97') : '#a94c19',
      weight: selected ? 6 : 4, opacity: selected ? 1 : 0.7,
      dashArray: route.feasible ? null : '7 7' };
  }

  return {
    pick(point) {
      selectedPoint = point;
      document.querySelector('#map-instruction').textContent = point === 'origin'
        ? 'Click the map to place A · ambulance location'
        : 'Click the map to place B · emergency destination';
    },
    updateMarkers(origin, destination) {
      markers.clearLayers();
      for (const [point, location, letter] of [['origin', origin, 'A'], ['destination', destination, 'B']]) {
        if (!location) continue;
        L.marker(location, { draggable: true, title: `${letter}: ${point}`, alt: `${letter}: ${point}`,
          icon: L.divIcon({ html: letter, className: `map-marker ${point}`, iconSize: [32, 32], iconAnchor: [16, 16] }) })
          .on('dragend', event => { const p = event.target.getLatLng(); onPick(point, [p.lat, p.lng]); })
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
      this.fit();
    },
    select(id) {
      for (const [key, { layer, route }] of routeLayers) layer.setStyle(style(route, key === id));
      routeLayers.get(id)?.layer.bringToFront();
    },
    fit,
  };
}
