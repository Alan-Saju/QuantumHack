"""Upper-triangular QUBO; one variable per retained dispatch or unserved choice."""
from dataclasses import dataclass
from itertools import product
from math import asin, cos, radians, sin, sqrt

from backend.models.route import Geometry, Model
from backend.allocation.scenario import AllocationRequest


class Choice(Model):
    incident_id: str
    ambulance_id: str | None = None
    hospital_id: str | None = None
    response_minutes: float = 0
    transport_minutes: float = 0
    cost: float
    legs: list[Geometry] = []


def compatible(plan):
    served = [c for c in plan if c.ambulance_id is not None]
    return (len({c.ambulance_id for c in served}) == len(served)
            and len({c.hospital_id for c in served}) == len(served))


def exact_plan(groups):
    return min((plan for plan in product(*groups) if compatible(plan)), key=lambda plan: sum(c.cost for c in plan))


@dataclass
class Problem:
    full_groups: list[list[Choice]]
    groups: list[list[Choice]]
    choices: list[Choice]
    q: dict[tuple[int, int], float]
    offset: float
    penalty: float

    def energy(self, bits):
        return self.offset + sum(value * bits[i] * bits[j] for (i, j), value in self.q.items())


def valid_bits(problem, bits):
    if len(bits) != len(problem.choices) or any(b not in (0, 1) for b in bits):
        return False
    selected = [c for c, bit in zip(problem.choices, bits) if bit]
    return (all(sum(c.incident_id == group[0].incident_id for c in selected) == 1 for group in problem.groups)
            and compatible(selected))


def synthetic_leg(start, end):
    a, b = radians(start.latitude), radians(end.latitude)
    dlat, dlon = b - a, radians(end.longitude - start.longitude)
    distance_km = 12742 * asin(sqrt(min(1, sin(dlat / 2)**2 + cos(a) * cos(b) * sin(dlon / 2)**2)))
    return distance_km / 30 * 60, Geometry(coordinates=[(start.longitude, start.latitude), (end.longitude, end.latitude)])


def build_problem(scenario: AllocationRequest, leg_provider=None) -> Problem:
    leg = leg_provider or synthetic_leg
    cache = {}

    def travel(start, end):
        key = (start.latitude, start.longitude, end.latitude, end.longitude)
        if key not in cache:
            cache[key] = leg(start, end)
        return cache[key]

    full_groups = []
    for incident in scenario.incidents:
        group = []
        for ambulance, hospital in product(scenario.ambulances, scenario.hospitals):
            if (not ambulance.available or not hospital.available_slots
                    or incident.requires not in ambulance.capabilities or incident.requires not in hospital.capabilities):
                continue
            response, transport = travel(ambulance, incident), travel(incident, hospital)
            if response is None or transport is None:
                continue
            group.append(Choice(incident_id=incident.id, ambulance_id=ambulance.id, hospital_id=hospital.id,
                                response_minutes=response[0], transport_minutes=transport[0],
                                cost=incident.severity * response[0] + scenario.transport_weight * transport[0],
                                legs=[response[1], transport[1]]))
        full_groups.append(sorted(group, key=lambda c: (c.cost, c.ambulance_id, c.hospital_id)))
    unserved_weight = 1 + sum(max((c.cost for c in group), default=0) for group in full_groups)
    for incident, group in zip(scenario.incidents, full_groups):
        group.append(Choice(incident_id=incident.id, cost=incident.severity * unserved_weight))
    groups = [group[:-1][:3] + [group[-1]] for group in full_groups]
    choices = [c for group in groups for c in group]
    penalty = 1 + sum(max(c.cost for c in group) for group in groups)
    q = {(i, i): c.cost - penalty for i, c in enumerate(choices)}
    for i, a in enumerate(choices):
        for j in range(i + 1, len(choices)):
            b = choices[j]
            same_incident = a.incident_id == b.incident_id
            conflict = (a.ambulance_id is not None and b.ambulance_id is not None
                        and (a.ambulance_id == b.ambulance_id or a.hospital_id == b.hospital_id))
            if same_incident or conflict:
                q[i, j] = penalty * (2 if same_incident else 1)
    return Problem(full_groups, groups, choices, q, penalty * len(groups), penalty)
