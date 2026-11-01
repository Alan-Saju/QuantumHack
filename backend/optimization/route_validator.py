from backend.models.route import RouteRequest, ScoredSegment


def validate_route(segments: list[ScoredSegment], request: RouteRequest) -> tuple[list[str], list[str]]:
    reasons, warnings = [], []
    for previous, current in zip(segments, segments[1:]):
        if previous.target != current.source:
            reasons.append("Disconnected route segments")
    for segment in segments:
        road = segment.road
        prefix = f"{segment.id}: "
        if segment.traffic == "blocked":
            reasons.append(prefix + "simulated road closure")
        if not road.direction_allowed:
            reasons.append(prefix + "one-way restriction")
        # No emergency access exemption is assumed.
        for tag in ("access", "vehicle", "motor_vehicle", "motorcar"):
            if road.tags.get(tag) in {"no", "private", "agricultural", "forestry"}:
                reasons.append(prefix + f"restricted {tag}")
        for limit, dimension, label in (
            (road.maxwidth_m, request.ambulance.width_m, "maxwidth"),
            (road.maxheight_m, request.ambulance.height_m, "maxheight"),
            (road.maxweight_t, request.ambulance.weight_t, "maxweight"),
            (road.width_m, request.ambulance.width_m, "nominal width"),
        ):
            if limit is not None and dimension > limit:
                reasons.append(prefix + f"vehicle exceeds {label}")
        if road.width_m is None:
            warnings.append(prefix + "road width unknown")
            if request.require_known_width:
                reasons.append(prefix + "known width required")
        if not road.matched:
            warnings.append(prefix + "no unique OSM way match; restrictions unknown")
        parsed_limits = {"maxwidth": road.maxwidth_m, "maxheight": road.maxheight_m,
                         "maxweight": road.maxweight_t}
        for tag, value in road.tags.items():
            if ":conditional" in tag or (tag in parsed_limits and parsed_limits[tag] is None):
                warnings.append(prefix + f"uninterpreted restriction {tag}={value}")
    warnings.append("Mapped width is not proof of usable clearance; turning, obstructions and node restrictions are not modeled.")
    return reasons, warnings
