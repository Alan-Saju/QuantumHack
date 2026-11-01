"""Kerala-wide operating rectangle with a margin around the state's extent.

This is an application boundary, not an administrative city-boundary polygon.
"""
KERALA_BOUNDS = ((8.15, 74.40), (12.90, 77.80))


def in_operating_area(latitude: float, longitude: float) -> bool:
    (south, west), (north, east) = KERALA_BOUNDS
    return south <= latitude <= north and west <= longitude <= east
