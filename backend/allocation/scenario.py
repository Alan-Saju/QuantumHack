from typing import Annotated, Literal

from pydantic import Field, model_validator

from backend.models.route import Location, Model, Positive, Scenario
from backend.models.geography import in_operating_area

Capability = Literal['general', 'cardiac', 'trauma']
Identifier = Annotated[str, Field(min_length=1, max_length=40, pattern=r'^[A-Za-z0-9_-]+$')]
VehicleType = Literal['traveller', 'omini']


class VehicleProfile(Model):
    label: str
    width_m: Positive
    height_m: Positive
    weight_t: Positive


# Editable research assumptions, not manufacturer or certified fleet dimensions.
VEHICLE_PROFILES = {
    'traveller': VehicleProfile(label='Traveller', width_m=2.4, height_m=2.8, weight_t=3.5),
    'omini': VehicleProfile(label='Omini', width_m=1.6, height_m=2.0, weight_t=1.5),
}


class Resource(Location):
    id: Identifier
    name: str = Field(min_length=1, max_length=80)
    capabilities: list[Capability] = Field(min_length=1, max_length=3)


class Ambulance(Resource):
    available: bool = True
    vehicle_type: VehicleType = 'traveller'
    width_m: Positive = 2.4
    height_m: Positive = 2.8
    weight_t: Positive = 3.5

    @model_validator(mode='before')
    @classmethod
    def profile_dimensions(cls, data):
        if isinstance(data, dict):
            vehicle_type = data.get('vehicle_type', 'traveller')
            if isinstance(vehicle_type, str) and vehicle_type in VEHICLE_PROFILES:
                data = dict(data)
                profile = VEHICLE_PROFILES[vehicle_type]
                for field in ('width_m', 'height_m', 'weight_t'):
                    data.setdefault(field, getattr(profile, field))
        return data


class Hospital(Resource):
    available_slots: int = Field(default=1, ge=0, le=1)


class Incident(Location):
    id: Identifier
    name: str = Field(min_length=1, max_length=80)
    severity: int = Field(ge=1, le=3)
    requires: Capability


class SolverOptions(Model):
    algorithm: Literal['exact', 'qaoa'] = 'exact'
    reps: int = Field(default=1, ge=1, le=3)
    shots: int = Field(default=1024, ge=64, le=8192)
    maxiter: int = Field(default=30, ge=10, le=100)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


class AllocationRequest(Model):
    ambulances: list[Ambulance] = Field(min_length=1, max_length=3)
    hospitals: list[Hospital] = Field(min_length=1, max_length=5)
    incidents: list[Incident] = Field(min_length=1, max_length=3)
    travel_source: Literal['synthetic', 'osrm'] = 'synthetic'
    transport_weight: float = Field(default=1, ge=0, le=10)
    require_known_width: bool = False
    consider_traffic: bool = False
    road_scenario: Scenario = Field(default_factory=Scenario)
    solver: SolverOptions = Field(default_factory=SolverOptions)

    @model_validator(mode='after')
    def unique_ids(self):
        for collection in (self.ambulances, self.hospitals, self.incidents):
            if len({item.id for item in collection}) != len(collection):
                raise ValueError('Resource identifiers must be unique within each collection')
            if any(not in_operating_area(item.latitude, item.longitude) for item in collection):
                raise ValueError('Resource locations must stay inside the Kerala operating area')
        return self


def demo_scenario(hospital_count: int = 3) -> AllocationRequest:
    scenario = AllocationRequest(
        ambulances=[
            Ambulance(id='A1', name='North ALS unit', latitude=9.994, longitude=76.294, capabilities=['general', 'cardiac', 'trauma']),
            Ambulance(id='A2', name='Central ALS unit', latitude=9.975, longitude=76.285, capabilities=['general', 'cardiac', 'trauma']),
            Ambulance(id='A3', name='South BLS unit', latitude=9.952, longitude=76.299, capabilities=['general'], vehicle_type='omini'),
        ],
        hospitals=[
            # Names/coordinates supplied by the user; capabilities/slots remain demo assumptions.
            Hospital(id='H1', name='Sunrise Hospital', latitude=10.025185, longitude=76.338884, capabilities=['general', 'trauma']),
            Hospital(id='H2', name='Gautham Hospital', latitude=9.952000, longitude=76.2990001, capabilities=['general', 'cardiac']),
            Hospital(id='H3', name='Aster Medicity', latitude=10.0469447, longitude=76.3352506, capabilities=['general']),
        ],
        incidents=[
            Incident(id='I1', name='Trauma incident', latitude=9.991, longitude=76.300, severity=3, requires='trauma'),
            Incident(id='I2', name='Cardiac incident', latitude=9.980, longitude=76.291, severity=3, requires='cardiac'),
            Incident(id='I3', name='General incident', latitude=9.960, longitude=76.298, severity=1, requires='general'),
        ],
    )
    if hospital_count == 5:
        scenario.hospitals.extend([
            Hospital(id='H4', name='West Emergency Centre (demo)', latitude=9.972, longitude=76.276, capabilities=['general', 'trauma']),
            Hospital(id='H5', name='East Cardiac Centre (demo)', latitude=9.989, longitude=76.325, capabilities=['general', 'cardiac']),
        ])
    return scenario
