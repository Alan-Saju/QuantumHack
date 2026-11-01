// Presentation helpers keep visual state separate from allocation requests.
export function node(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

export function updateOverview(scenario) {
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  text('fleet-count', scenario.ambulances.filter(item => item.available).length);
  text('incident-count', scenario.incidents.length);
  text('hospital-slot-count', scenario.hospitals.reduce((sum, item) => sum + item.available_slots, 0));
  text('hospital-network-label', `${scenario.hospitals.length} fixed hospital sites`);
  text('ambulance-group-count', scenario.ambulances.length);
  text('incident-group-count', scenario.incidents.length);
  text('hospital-group-count', scenario.hospitals.length);
  text('scenario-size', 'Manual setup');
}

const glyphs = {
  ambulance: '<rect x="3" y="7" width="11" height="10" rx="2"/><path d="M14 10h4l3 4v3h-7M7 10v4m-2-2h4"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  incident: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.2"/>',
  hospital: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 6v6m-3-3h6M9 21v-5h6v5"/>',
};

export function resourceIcon(resource, type) {
  const face = node('span', '', 'marker-face');
  // SVG markup is an internal constant; resource labels are appended as text.
  face.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[type]}</svg>`;
  face.append(node('span', resource.id, 'marker-id'));
  return L.divIcon({ html: face, className: `resource-marker ${type}${resource.available === false || resource.available_slots === 0 ? ' unavailable' : ''}`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -22] });
}

export function renderShortcuts(scenario, onSelect) {
  const container = document.getElementById('resource-shortcuts');
  container.replaceChildren();
  for (const resource of [...scenario.ambulances, ...scenario.incidents]) {
    const button = node('button', resource.id);
    button.type = 'button';
    button.dataset.resourceId = resource.id;
    button.dataset.type = scenario.ambulances.includes(resource) ? 'ambulance' : 'incident';
    button.setAttribute('aria-label', `Place ${resource.id} on map`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => onSelect(resource.id));
    container.append(button);
  }
}

export function metric(value, label) {
  const element = node('div', '', 'metric');
  element.append(node('strong', value), node('span', label));
  return element;
}
