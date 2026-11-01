import { buildRequest } from './routing.js';

export function buildTripRequests(origin, incident, hospital) {
  return [buildRequest(origin, incident), buildRequest(incident, hospital)];
}

// Each alternative is a complete journey through the same incident stop.
export function combineTripRoutes(response, transport) {
  const candidates = [];
  response.candidates.forEach((first, i) => transport.candidates.forEach((second, j) => {
    const cost = Object.fromEntries(Object.keys(first.cost).map(key => [key, first.cost[key] + second.cost[key]]));
    candidates.push({ id: `trip-${i}-${j}`, legs: [first, second],
      distance_m: first.distance_m + second.distance_m,
      estimated_time_s: first.estimated_time_s + second.estimated_time_s,
      geometry: { type: 'MultiLineString', coordinates: [first.geometry.coordinates, second.geometry.coordinates] },
      feasible: first.feasible && second.feasible, cost,
      segments: [...first.segments, ...second.segments],
      rejection_reasons: [...first.rejection_reasons.map(reason => `Incident leg: ${reason}`),
        ...second.rejection_reasons.map(reason => `Hospital leg: ${reason}`)],
      warnings: [...new Set([...first.warnings, ...second.warnings])],
    });
  }));
  const recommended = candidates.find(route => route.feasible && route.legs[0].id === response.classical_route?.id
    && route.legs[1].id === transport.classical_route?.id)
    ?? candidates.filter(route => route.feasible).reduce((best, route) => !best || route.cost.total < best.cost.total ? route : best, null);
  return { candidates, classical_route: recommended, status: recommended ? 'success' : 'no_feasible_route',
    missingLeg: !response.candidates.length ? 'incident' : !transport.candidates.length ? 'hospital' : null };
}
