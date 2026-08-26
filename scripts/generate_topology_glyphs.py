"""Generate deterministic topology glyphs from explicit parametric surfaces."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable


TAU = math.tau
INK = "#21302c"
TEAL = "#3f8c87"
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
class Glyph:
    name: str
    model: str
    description: str
    curves: list[Curve]
    rotation: tuple[float, float, float]


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
    """Figure-eight immersion, with (2π,v) identified with (0,-v)."""
    radius = 2.55
    radial = radius + math.cos(theta / 2) * math.sin(v) - math.sin(theta / 2) * math.sin(2 * v)
    return (
        radial * math.cos(theta),
        radial * math.sin(theta),
        math.sin(theta / 2) * math.sin(v) + math.cos(theta / 2) * math.sin(2 * v),
    )


def roman(theta: float, phi: float) -> Point3:
    """Roman-surface map H(x,y,z)=(yz,zx,xy) of S²/{p~-p}=RP²."""
    x = math.sin(theta) * math.cos(phi)
    y = math.sin(theta) * math.sin(phi)
    z = math.cos(theta)
    return 2.2 * y * z, 2.2 * z * x, 2.2 * x * y


def plane_glyph() -> Glyph:
    curves: list[Curve] = []
    grid = values(-1.0, 1.0, 5)
    for coordinate in grid:
        curves.append(sampled_curve(lambda value, c=coordinate: plane(c, value), -1, 1, 2))
        curves.append(sampled_curve(lambda value, c=coordinate: plane(value, c), -1, 1, 2))
    boundary = [plane(-1, -1), plane(1, -1), plane(1, 1), plane(-1, 1)]
    curves.append(Curve(boundary, accent=True, width=2.7, opacity=0.9, closed=True))
    return Glyph("plane", "bounded-plane-grid", "P(u,v)=(u,v,0), -1≤u,v≤1", curves, (0.92, 0.0, -0.62))


def cylinder_glyph() -> Glyph:
    curves: list[Curve] = []
    for axial in values(-1, 1, 5):
        curves.append(sampled_curve(lambda angle, a=axial: cylinder(angle, a), 0, TAU, 97, closed=True,
                                    width=2.4 if abs(axial) == 1 else 1.8,
                                    opacity=0.86 if abs(axial) == 1 else 0.58))
    for angle in values(0, TAU, 8, endpoint=False):
        curves.append(sampled_curve(lambda axial, a=angle: cylinder(a, axial), -1, 1, 25, opacity=0.62))
    curves.append(sampled_curve(lambda axial: cylinder(0, axial), -1, 1, 25, accent=True, width=2.8, opacity=0.92))
    return Glyph("cylinder", "periodic-cylinder", "C(u,v)=(1.35v,cos u,sin u), u mod 2π", curves, (0.38, -0.28, -0.18))


def torus_glyph() -> Glyph:
    curves: list[Curve] = []
    for v in values(0, TAU, 8, endpoint=False):
        curves.append(sampled_curve(lambda u, fixed=v: torus(u, fixed), 0, TAU, 121, closed=True, opacity=0.56))
    for u in values(0, TAU, 10, endpoint=False):
        curves.append(sampled_curve(lambda v, fixed=u: torus(fixed, v), 0, TAU, 73, closed=True, opacity=0.64))
    curves.append(sampled_curve(lambda u: torus(u, 0), 0, TAU, 121, accent=True, width=2.8, opacity=0.9, closed=True))
    return Glyph("torus", "doubly-periodic-torus", "T(u,v)=((R+r cos v)cos u,(R+r cos v)sin u,r sin v)", curves, (0.78, -0.12, -0.2))


def mobius_glyph() -> Glyph:
    width = 0.48
    curves: list[Curve] = []
    boundary_points = [mobius(t, width) for t in values(0, TAU, 121)]
    boundary_points.extend(mobius(t, -width) for t in values(0, TAU, 121))
    curves.append(Curve(boundary_points, width=2.6, opacity=0.88, closed=True))
    curves.append(sampled_curve(lambda t: mobius(t, 0), 0, TAU, 145, accent=True, width=2.8, opacity=0.94, closed=True))
    for t in values(0, TAU, 12, endpoint=False):
        curves.append(sampled_curve(lambda s, fixed=t: mobius(fixed, s), -width, width, 17, opacity=0.62))
    return Glyph("mobius", "standard-mobius-strip", "M(t,s)=((R+s cos(t/2))cos t,(R+s cos(t/2))sin t,s sin(t/2))", curves, (0.92, 0.04, -0.3))


def klein_glyph() -> Glyph:
    curves: list[Curve] = []
    for theta in values(0, TAU, 4, endpoint=False):
        curves.append(sampled_curve(lambda v, fixed=theta: klein(fixed, v), 0, TAU, 97, closed=True, opacity=0.59))
    for v in (0.0, math.pi / 2, 3 * math.pi / 2):
        curves.append(sampled_curve(lambda theta, fixed=v: klein(theta, fixed), 0, TAU, 145,
                                    width=2.5 if v == 0 else 1.9,
                                    opacity=0.76 if v == 0 else 0.58,
                                    closed=v == 0))
    curves.append(sampled_curve(lambda v: klein(0, v), 0, TAU, 121, accent=True, width=2.9, opacity=0.94, closed=True))
    return Glyph("klein", "figure-eight-klein-immersion", "K(2π,v)=K(0,-v); standard figure-eight immersion", curves, (0.92, -0.14, -0.30))


def projective_glyph() -> Glyph:
    curves: list[Curve] = []
    for theta in values(0.13, math.pi / 2, 7):
        curves.append(sampled_curve(lambda phi, fixed=theta: roman(fixed, phi), 0, TAU, 145, closed=True, opacity=0.58))
    for phi in values(0, TAU, 12, endpoint=False):
        curves.append(sampled_curve(lambda theta, fixed=phi: roman(theta, fixed), 0, math.pi / 2, 73, opacity=0.64))
    curves.append(sampled_curve(lambda phi: roman(math.pi / 4, phi), 0, TAU, 145, accent=True, width=2.8, opacity=0.9, closed=True))
    return Glyph("projective", "roman-surface-rp2", "H(x,y,z)=(yz,zx,xy), H(p)=H(-p), hence S²/{±1}=RP²", curves, (0.66, -0.52, 0.12))


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


def render(glyph: Glyph) -> str:
    rotated_curves: list[tuple[Curve, list[Point3]]] = []
    all_points: list[Point3] = []
    for curve in glyph.curves:
        points = [rotate(point, glyph.rotation) for point in curve.points]
        rotated_curves.append((curve, points))
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

    transformed: list[tuple[Curve, list[tuple[float, float]], float]] = []
    for curve, points in rotated_curves:
        projected = [(128 + (point[0] - center_x) * scale, 128 - (point[1] - center_y) * scale) for point in points]
        average_depth = sum(point[2] for point in points) / len(points)
        transformed.append((curve, projected, average_depth))
    transformed.sort(key=lambda item: (item[0].accent, item[2]))

    paths: list[str] = []
    for curve, points, _depth in transformed:
        color = TEAL if curve.accent else INK
        paths.append(
            f'<path d="{path_data(points, curve.closed)}" fill="none" stroke="{color}" '
            f'stroke-width="{curve.width:.2f}" stroke-opacity="{curve.opacity:.2f}" '
            'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
        )

    return "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" data-model="{glyph.model}">',
        f'  <desc>{glyph.description}</desc>',
        '  <g>',
        *[f"    {path}" for path in paths],
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
