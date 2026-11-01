from hashlib import sha256

from backend.models.route import Scenario, TrafficLevel

SPEED_FACTORS = {"low": 1.0, "medium": 0.65, "high": 0.35, "blocked": 1.0}


def traffic_level(segment_id: str, scenario: Scenario) -> TrafficLevel:
    if segment_id in scenario.overrides:
        return scenario.overrides[segment_id]
    digest = sha256(f"{scenario.seed}:{segment_id}".encode()).digest()
    return ("low", "medium", "high")[digest[0] % 3]
