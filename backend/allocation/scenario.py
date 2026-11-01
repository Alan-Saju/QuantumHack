from typing import Annotated, Literal

from pydantic import Field, model_validator

from backend.models.route import Location, Model

Capability = Literal['general', 'cardiac', 'trauma']
Identifier = Annotated[str, Field(min_length=1, max_length=40, pattern=r'^[A-Za-z0-9_-]+$')]


class Resource(Location):
    id: Identifier
    name: str = Field(min_length=1, max_length=80)
    capabilities: list[Capability] = Field(min_length=1, max_length=3)


class Ambulance(Resource):
    available: bool = True


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
    solver: SolverOptions = Field(default_factory=SolverOptions)

    @model_validator(mode='after')
    def unique_ids(self):
        for collection in (self.ambulances, self.hospitals, self.incidents):
            if len({item.id for item in collection}) != len(collection):
                raise ValueError('Resource identifiers must be unique within each collection')
        return self


def demo_scenario(hospital_count: int = 3) -> AllocationRequest:
    scenario = AllocationRequest(
        ambulances=[
            Ambulance(id='A1', name='North ALS unit', latitude=9.994, longitude=76.294, capabilities=['general', 'cardiac', 'trauma']),
            Ambulance(id='A2', name='Central ALS unit', latitude=9.975, longitude=76.285, capabilities=['general', 'cardiac', 'trauma']),
            Ambulance(id='A3', name='South BLS unit', latitude=9.952, longitude=76.299, capabilities=['general']),
        ],
        hospitals=[
            Hospital(id='H1', name='North Trauma Centre (demo)', latitude=10.006, longitude=76.307, capabilities=['general', 'trauma']),
            Hospital(id='H2', name='Central Cardiac Centre (demo)', latitude=9.982, longitude=76.303, capabilities=['general', 'cardiac']),
            Hospital(id='H3', name='South General Hospital (demo)', latitude=9.958, longitude=76.310, capabilities=['general']),
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
