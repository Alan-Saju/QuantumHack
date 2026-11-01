import { formatDuration } from './routing.js';

export function compareRoutes(routes, recommendedId) {
  const fastest = Math.min(...routes.filter(route => route.feasible).map(route => route.estimated_time_s));
  return routes.map(route => ({ ...route,
    badge: !route.feasible ? 'Inspect only' : route.id === recommendedId && recommendedId != null
      ? 'Recommended' : route.estimated_time_s === fastest ? 'Fastest' : 'Alternative',
    difference: !route.feasible ? 'Failed road checks' : route.estimated_time_s === fastest
      ? 'Fastest available' : `+${formatDuration(route.estimated_time_s - fastest)} vs fastest`,
  }));
}

export function formatArrival(seconds, departure) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23' }).format(new Date(departure.getTime() + seconds * 1000)) + ' IST';
}
