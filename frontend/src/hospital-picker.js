// Shared map catalogue picker; clinical capability and bed data are never inferred.
export function createHospitalPicker(map, onSelect) {
  const panel = document.querySelector('#hospital-picker');
  const list = panel.querySelector('.hospital-results');
  const message = panel.querySelector('.hospital-search-status');
  const search = panel.querySelector('.hospital-search');
  const markers = L.featureGroup().addTo(map);
  let controller, revision = 0, active = false;

  function clear() {
    revision++; controller?.abort(); markers.clearLayers(); list.replaceChildren(); search.disabled = false;
  }
  function close() {
    active = false; clear(); panel.hidden = true;
  }
  function select(place) {
    close(); onSelect(place);
  }
  async function find() {
    clear();
    const current = revision;
    controller = new AbortController();
    const bounds = map.getBounds();
    const query = new URLSearchParams({ south: Math.max(-90, bounds.getSouth()), west: Math.max(-180, bounds.getWest()),
      north: Math.min(90, bounds.getNorth()), east: Math.min(180, bounds.getEast()) });
    search.disabled = true; message.textContent = 'Finding mapped hospitals in this view…';
    try {
      const response = await fetch(`/api/hospitals?${query}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Hospital locations could not be loaded. Try again.');
      if (current !== revision || !active) return;
      message.textContent = data.hospitals.length
        ? `${data.hospitals.length} mapped hospitals${data.truncated ? ' shown. Zoom in to see more.' : ' in this view.'}`
        : 'No mapped hospitals in this view. Move or zoom out, then search again.';
      for (const place of data.hospitals) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'hospital-result'; button.textContent = place.name;
        button.setAttribute('aria-label', `Use ${place.name}`);
        button.addEventListener('click', () => select(place)); list.append(button);
        const popup = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = place.name;
        const use = document.createElement('button'); use.type = 'button'; use.className = 'hospital-use'; use.textContent = 'Use this hospital';
        use.addEventListener('click', () => select(place)); popup.append(name, use);
        L.marker([place.latitude, place.longitude], { title: place.name, alt: `Hospital: ${place.name}`,
          icon: L.divIcon({ html: '+', className: 'hospital-catalogue-marker', iconSize: [28, 28], iconAnchor: [14, 14] }) })
          .bindPopup(popup, { autoPan: false }).on('click', event => L.DomEvent.stopPropagation(event)).addTo(markers);
      }
    } catch (error) {
      if (current === revision && error.name !== 'AbortError') message.textContent = error.message;
    } finally {
      if (current === revision) search.disabled = false;
    }
  }
  search.addEventListener('click', find);
  panel.querySelector('.hospital-close').addEventListener('click', () => { close(); document.querySelector('#choose-hospital')?.focus(); });
  map.on('moveend', () => {
    if (active) { clear(); message.textContent = 'Map moved. Search this view to refresh the hospitals.'; }
  });
  return { close, open(title = 'Choose a hospital') {
    active = true; panel.hidden = false;
    panel.querySelector('h2').textContent = title;
    search.focus({ preventScroll: true });
    find();
  } };
}
