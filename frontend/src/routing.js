import { withinArea } from './operating-area.js';

export function buildRequest(origin, destination) {
  for (const point of [origin, destination]) {
    if (point.length !== 2 || !point.every(value => typeof value === 'number' && Number.isFinite(value))
        || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) {
      throw new Error('Enter a valid latitude and longitude for both locations.');
    }
  }
  if (![origin, destination].every(point => withinArea(point[0], point[1]))) {
    throw new RangeError('Choose locations inside the Kerala operating area.');
  }
  return {
    ambulance: { latitude: origin[0], longitude: origin[1] },
    emergency: { latitude: destination[0], longitude: destination[1] },
    optimization: { algorithm: 'classical', consider_traffic: false,
      consider_road_width: true, consider_risk: true },
  };
}

export const formatDistance = meters => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const formatDuration = seconds => seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.ceil(seconds / 60)} min`;

export function routeError(status) {
  if (status === 503) return 'Local OSRM is unavailable. Start the routing service, then try again.';
  if (status === 422) return 'Check the coordinates for both locations and try again.';
  return 'The route could not be loaded. Please try again.';
}
