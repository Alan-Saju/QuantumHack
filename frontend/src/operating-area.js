// Fallback supports older/mock map-config responses; live config is authoritative.
export const KERALA_BOUNDS = [[8.15, 74.40], [12.90, 77.80]];

export function withinArea(latitude, longitude, bounds = KERALA_BOUNDS) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= bounds[0][0] && latitude <= bounds[1][0]
    && longitude >= bounds[0][1] && longitude <= bounds[1][1];
}

export function constrainMap(map, bounds = KERALA_BOUNDS) {
  const area = L.latLngBounds(bounds);
  map.options.maxBoundsViscosity = 1;
  map.setMaxBounds(area);
  // Allow all of Kerala to fit on each screen, while preventing world zoom-out.
  const resize = () => map.setMinZoom(map.getBoundsZoom(area));
  resize();
  map.on('resize', resize);
  return area;
}
