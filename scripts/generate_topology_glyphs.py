"""Generate deterministic topology glyphs from explicit parametric surfaces."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable


TAU = math.tau
INK = "#282522"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "app" / "assets" / "topologies"


Point3 = tuple[float, float, float]
Surface = Callable[[float, float], Point3]


@dataclass
class Curve:
    points: list[Point3]
    accent: bool = False
    width: float = 2.0
    opacity: float = 0.72
    closed: bool = False


@dataclass
class Patch:
    points: list[Point3]
    fill: str | None = None


@dataclass
class Glyph:
    name: str
    model: str
    description: str
    curves: list[Curve]
    rotation: tuple[float, float, float]
    patches: list[Patch] = field(default_factory=list)
    hull_outline: bool = True


def values(start: float, end: float, count: int, endpoint: bool = True) -> list[float]:
    divisor = count - 1 if endpoint else count
    return [start + (end - start) * index / divisor for index in range(count)]


def close(a: Point3, b: Point3, tolerance: float = 1e-8) -> bool:
    return all(abs(left - right) <= tolerance for left, right in zip(a, b))


def rotate(point: Point3, angles: tuple[float, float, float]) -> Point3:
    x, y, z = point
    rx, ry, rz = angles

    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return x, y, z


def sampled_curve(function: Callable[[float], Point3], start: float, end: float, count: int, **style: object) -> Curve:
    return Curve([function(value) for value in values(start, end, count)], **style)


def sampled_surface(function: Surface, u_start: float, u_end: float, u_segments: int,
                    v_start: float, v_end: float, v_segments: int) -> list[Patch]:
    us = values(u_start, u_end, u_segments + 1)
    vs = values(v_start, v_end, v_segments + 1)
    patches: list[Patch] = []
    for u_index in range(u_segments):
        for v_index in range(v_segments):
            patches.append(Patch([
                function(us[u_index], vs[v_index]),
                function(us[u_index + 1], vs[v_index]),
                function(us[u_index + 1], vs[v_index + 1]),
                function(us[u_index], vs[v_index + 1]),
            ]))
    return patches


def bezier_chain(start: tuple[float, float], segments: list[tuple[tuple[float, float], tuple[float, float], tuple[float, float]]],
                 count: int = 16, depth: float = 0.0) -> list[Point3]:
    points: list[Point3] = [(start[0], start[1], depth)]
    current = start
    for control_a, control_b, end in segments:
        for step in range(1, count + 1):
            t = step / count
            inverse = 1 - t
            x = inverse ** 3 * current[0] + 3 * inverse ** 2 * t * control_a[0] + 3 * inverse * t ** 2 * control_b[0] + t ** 3 * end[0]
            y = inverse ** 3 * current[1] + 3 * inverse ** 2 * t * control_a[1] + 3 * inverse * t ** 2 * control_b[1] + t ** 3 * end[1]
            points.append((x, y, depth))
        current = end
    return points


def plane(u: float, v: float) -> Point3:
    return u, v, 0.0


def cylinder(u: float, v: float) -> Point3:
    return 1.35 * v, math.cos(u), math.sin(u)


def torus(u: float, v: float) -> Point3:
    major = 1.45
    minor = 0.52
    radius = major + minor * math.cos(v)
    return radius * math.cos(u), radius * math.sin(u), minor * math.sin(v)


def mobius(t: float, s: float) -> Point3:
    radius = 1.35 + s * math.cos(t / 2)
    return radius * math.cos(t), radius * math.sin(t), s * math.sin(t / 2)


def klein(theta: float, v: float) -> Point3:
    """Classic bottle-shaped immersion, reparameterized so K(2π,v)=K(0,-v)."""
    shifted_v = v + math.pi / 2
    radius = 4 * (1 - 0.5 * math.cos(theta))
    if theta < math.pi:
        x = 6 * math.cos(theta) * (1 + math.sin(theta)) + radius * math.cos(theta) * math.cos(shifted_v)
        y = 16 * math.sin(theta) + radius * math.sin(theta) * math.cos(shifted_v)
    else:
        x = 6 * math.cos(theta) * (1 + math.sin(theta)) - radius * math.cos(shifted_v)
        y = 16 * math.sin(theta)
    z = radius * math.sin(shifted_v)
    return x, y, z


def roman(theta: float, phi: float) -> Point3:
    """Roman-surface map H(x,y,z)=(yz,zx,xy) of S²/{p~-p}=RP²."""
    x = math.sin(theta) * math.cos(phi)
    y = math.sin(theta) * math.sin(phi)
    z = math.cos(theta)
    return 2.2 * y * z, 2.2 * z * x, 2.2 * x * y


def plane_glyph() -> Glyph:
    boundary = [plane(-1, -1), plane(1, -1), plane(1, 1), plane(-1, 1)]
    return Glyph("plane", "shaded-bounded-plane", "P(u,v)=(u,v,0), -1≤u,v≤1",
                 [], (0.92, 0.0, -0.62), [Patch(boundary)])


def cylinder_glyph() -> Glyph:
    curves = [sampled_curve(lambda angle, axial=axial: cylinder(angle, axial), 0, TAU, 121,
                            closed=True, width=2.8, opacity=0.96) for axial in (-1.0, 1.0)]
    patches = sampled_surface(cylinder, 0, TAU, 40, -1, 1, 7)
    return Glyph("cylinder", "shaded-periodic-cylinder", "C(u,v)=(1.35v,cos u,sin u), u mod 2π",
                 curves, (0.38, -0.28, -0.18), patches)


def torus_glyph() -> Glyph:
    patches = sampled_surface(torus, 0, TAU, 40, 0, TAU, 16)
    inner_ring = sampled_curve(lambda angle: torus(angle, math.pi), 0, TAU, 161,
                               closed=True, width=2.5, opacity=0.94)
    return Glyph("torus", "shaded-doubly-periodic-torus",
                 "T(u,v)=((R+r cos v)cos u,(R+r cos v)sin u,r sin v)",
                 [inner_ring], (0.78, -0.12, -0.2), patches)


def mobius_glyph() -> Glyph:
    strip_width = 0.72
    boundary_points = [mobius(t, strip_width) for t in values(0, TAU, 193)]
    boundary_points.extend(mobius(t, -strip_width) for t in values(0, TAU, 193))
    curves = [Curve(boundary_points, width=2.8, opacity=0.96, closed=True)]
    patches = sampled_surface(mobius, 0, TAU, 56, -strip_width, strip_width, 12)
    return Glyph("mobius", "shaded-mobius-embedding",
                 "standard Möbius embedding with M(0,s)=M(2π,−s)", curves,
                 (1.02, -0.03, -0.10), patches, hull_outline=False)


def klein_glyph() -> Glyph:
    # The directory thumbnail uses the classic bottle silhouette rather than the
    # alpha hull of the immersion: the neck grows out of the body, loops over,
    # and visibly penetrates the right shoulder before disappearing behind it.
    outer = bezier_chain((0.48, 0.08), [
        ((0.85, 0.28), (1.28, 0.61), (1.30, 1.10)),
        ((1.34, 1.58), (0.98, 1.92), (0.50, 1.96)),
        ((0.02, 2.00), (-0.30, 1.67), (-0.32, 1.25)),
        ((-0.35, 0.84), (-0.62, 0.55), (-0.83, 0.18)),
        ((-1.15, -0.36), (-1.08, -1.02), (-0.62, -1.35)),
        ((-0.20, -1.63), (0.48, -1.52), (0.78, -1.15)),
        ((1.05, -0.78), (1.06, -0.20), (0.72, 0.12)),
        ((0.62, 0.22), (0.55, 0.14), (0.48, 0.08)),
    ], depth=-0.5)
    loop_opening = bezier_chain((0.38, 0.35), [
        ((0.72, 0.55), (0.95, 0.78), (0.92, 1.15)),
        ((0.90, 1.50), (0.68, 1.70), (0.43, 1.68)),
        ((0.15, 1.66), (0.00, 1.42), (0.01, 1.18)),
        ((0.02, 0.88), (0.18, 0.58), (0.38, 0.35)),
    ], depth=0.6)
    shadow = bezier_chain((-0.64, -1.43), [
        ((-0.12, -1.58), (0.53, -1.50), (0.83, -1.19)),
        ((1.00, -0.98), (1.08, -0.66), (1.02, -0.42)),
        ((0.65, -0.68), (0.20, -0.88), (-0.20, -0.98)),
        ((-0.44, -1.10), (-0.56, -1.28), (-0.64, -1.43)),
    ], depth=0.5)
    crossing = sampled_curve(lambda angle: (0.58 + 0.24 * math.cos(angle), 0.15 + 0.11 * math.sin(angle), 0.0),
                             0, TAU, 73, width=2.5, opacity=0.94, closed=True)
    opening_outline = Curve(loop_opening, width=2.7, opacity=0.96, closed=True)
    return Glyph("klein", "hand-drawn-classic-klein-bottle-schematic",
                 "classic loop-neck bottle schematic backed by a verified Klein immersion",
                 [Curve(outer, width=3.0, opacity=0.96, closed=True), opening_outline, crossing],
                 (0.0, 0.0, -0.12),
                 [Patch(outer, "#d6d2c7"), Patch(shadow, "#f4f1e9"), Patch(loop_opening, "#fbf9f2")],
                 hull_outline=False)


def projective_glyph() -> Glyph:
    curves = [sampled_curve(lambda phi: roman(math.pi / 4, phi), 0, TAU, 145,
                            accent=True, width=3.0, opacity=0.94, closed=True)]
    patches = sampled_surface(roman, 0.05, math.pi / 2, 14, 0, TAU, 40)
    return Glyph("projective", "shaded-roman-surface-rp2-immersion",
                 "Roman-surface immersion H(x,y,z)=(yz,zx,xy), invariant under p↦−p",
                 curves, (0.66, -0.52, 0.12), patches)


def verify_models() -> None:
    for sample in values(-0.48, 0.48, 7):
        assert close(mobius(0, sample), mobius(TAU, -sample))
    for sample in values(0, TAU, 9):
        assert close(cylinder(0, math.sin(sample)), cylinder(TAU, math.sin(sample)))
        assert close(klein(TAU, sample), klein(0, -sample))
    for u in values(0, TAU, 7):
        for v in values(0, TAU, 7):
            assert close(torus(u, v), torus(u + TAU, v))
            assert close(torus(u, v), torus(u, v + TAU))
    for theta in values(0, math.pi, 7):
        for phi in values(0, TAU, 7):
            point = roman(theta, phi)
            antipodal = roman(math.pi - theta, phi + math.pi)
            assert close(point, antipodal)


def path_data(points: Iterable[tuple[float, float]], closed: bool) -> str:
    coordinates = list(points)
    commands = [f"M {coordinates[0][0]:.2f} {coordinates[0][1]:.2f}"]
    commands.extend(f"L {x:.2f} {y:.2f}" for x, y in coordinates[1:])
    if closed:
        commands.append("Z")
    return " ".join(commands)


def vector_wobble(point: tuple[float, float], seed: float) -> tuple[float, float]:
    """Add a subtle, deterministic ink wobble without rasterizing the stroke."""
    x, y = point
    offset_x = math.sin(x * 0.061 + y * 0.037 + seed) * 0.58
    offset_x += math.sin(x * 0.019 - y * 0.047 + seed * 1.7) * 0.24
    offset_y = math.sin(x * 0.041 - y * 0.057 + seed * 1.3) * 0.52
    offset_y += math.sin(x * 0.023 + y * 0.031 + seed * 2.1) * 0.22
    return x + offset_x, y + offset_y


def convex_hull(points: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
    """Return a deterministic outer contour for the projected color blocks."""
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique

    def cross(origin: tuple[float, float], left: tuple[float, float], right: tuple[float, float]) -> float:
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def mix_color(light: tuple[int, int, int], dark: tuple[int, int, int], amount: float) -> str:
    channels = [round(left + (right - left) * amount) for left, right in zip(light, dark)]
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def render(glyph: Glyph) -> str:
    rotated_curves: list[tuple[Curve, list[Point3]]] = []
    rotated_patches: list[list[Point3]] = []
    all_points: list[Point3] = []
    for curve in glyph.curves:
        points = [rotate(point, glyph.rotation) for point in curve.points]
        rotated_curves.append((curve, points))
        all_points.extend(points)
    for patch in glyph.patches:
        points = [rotate(point, glyph.rotation) for point in patch.points]
        rotated_patches.append(points)
        all_points.extend(points)

    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    span_x = max_x - min_x
    span_y = max_y - min_y
    scale = min(204 / span_x, 188 / span_y)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    wobble_seed = sum((index + 1) * ord(character) for index, character in enumerate(glyph.name)) * 0.017

    transformed: list[tuple[Curve, list[tuple[float, float]], float]] = []
    for curve, points in rotated_curves:
        projected = [vector_wobble(
            (128 + (point[0] - center_x) * scale, 128 - (point[1] - center_y) * scale),
            wobble_seed,
        ) for point in points]
        average_depth = sum(point[2] for point in points) / len(points)
        transformed.append((curve, projected, average_depth))
    transformed.sort(key=lambda item: (item[0].accent, item[2]))

    surface_paths: list[str] = []
    projected_patches: list[tuple[list[tuple[float, float]], float, str | None]] = []
    for patch, points in zip(glyph.patches, rotated_patches):
        projected = [vector_wobble(
            (128 + (point[0] - center_x) * scale, 128 - (point[1] - center_y) * scale),
            wobble_seed,
        ) for point in points]
        projected_patches.append((projected, sum(point[2] for point in points) / len(points), patch.fill))
    projected_patches.sort(key=lambda item: item[1])
    if projected_patches:
        depths = [depth for _points, depth, _fill in projected_patches]
        depth_span = max(depths) - min(depths) or 1.0
        for points, depth, fill in projected_patches:
            relative_depth = (depth - min(depths)) / depth_span
            shade = 0.08 if len(projected_patches) == 1 else 0.48 if relative_depth < 0.34 else 0.23 if relative_depth < 0.67 else 0.06
            color = fill or mix_color((251, 249, 242), (164, 159, 147), shade)
            surface_paths.append(
                f'<path d="{path_data(points, True)}" fill="{color}" stroke="{color}" '
                'stroke-width="1.50" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
            )
    outline = convex_hull(point for points, _depth, _fill in projected_patches for point in points) \
        if glyph.hull_outline else []
    curve_paths: list[str] = []
    for curve, points, _depth in transformed:
        curve_paths.append(
            f'<path d="{path_data(points, curve.closed)}" fill="none" stroke="{INK}" '
            f'stroke-width="{curve.width * 1.12:.2f}" stroke-opacity="{curve.opacity:.2f}" '
            'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
        )

    return "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" shape-rendering="geometricPrecision" data-model="{glyph.model}" data-style="hand-drawn-cel-silhouette">',
        f'  <desc>{glyph.description}</desc>',
        '  <g>',
        *[f"    {path}" for path in surface_paths],
        '  </g>',
        *([f'  <path d="{path_data(outline, True)}" fill="none" stroke="{INK}" stroke-width="3.14" '
           'stroke-opacity="0.96" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'] if outline else []),
        '  <g>',
        *[f"    {path}" for path in curve_paths],
        '  </g>',
        '</svg>',
        '',
    ])


def main() -> None:
    verify_models()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    glyphs = [plane_glyph(), cylinder_glyph(), torus_glyph(), mobius_glyph(), klein_glyph(), projective_glyph()]
    for glyph in glyphs:
        (OUTPUT_DIR / f"{glyph.name}.svg").write_text(render(glyph), encoding="utf-8", newline="\n")
        print(f"generated {glyph.name}.svg")


if __name__ == "__main__":
    main()
