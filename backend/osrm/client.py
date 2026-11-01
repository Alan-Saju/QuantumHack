import httpx

from backend.models.route import Location
from backend.osrm.route_generator import parse_routes


class OSRMError(Exception):
    """An unavailable or invalid routing upstream."""


class OSRMClient:
    def __init__(self, client: httpx.Client, base_url: str = "http://127.0.0.1:5000"):
        self.client = client
        self.base_url = base_url.rstrip("/")

    def _get(self, service: str, points: list[Location], params: dict):
        coordinates = ";".join(f"{p.longitude},{p.latitude}" for p in points)
        try:
            response = self.client.get(f"{self.base_url}/{service}/v1/driving/{coordinates}", params=params)
            payload = response.json()
            if service == "route" and response.status_code in {200, 400} and isinstance(payload, dict) and payload.get("code") == "NoRoute":
                return payload
            response.raise_for_status()
            if not isinstance(payload, dict) or payload.get("code") not in {"Ok", "NoRoute"}:
                raise ValueError("Invalid OSRM response")
            return payload
        except (httpx.HTTPError, ValueError) as exc:
            raise OSRMError("OSRM is unavailable or returned an invalid response") from exc

    def routes(self, start: Location, end: Location):
        payload = self._get("route", [start, end], {
            "alternatives": "true", "geometries": "geojson", "overview": "full",
            "annotations": "nodes,distance,duration", "steps": "false",
            "radiuses": "100;100",
        })
        try:
            return parse_routes(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise OSRMError("OSRM returned invalid route annotations") from exc

    def nearest(self, point: Location):
        return self._get("nearest", [point], {"number": 1})

    def table(self, start: Location, end: Location):
        return self._get("table", [start, end], {"annotations": "distance,duration"})
