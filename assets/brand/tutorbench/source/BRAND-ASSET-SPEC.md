# TutorBench Brand Asset Spec

## Locked symbol
T1 trajectory mark: four parallel evaluation trajectories with matched Bézier geometry.
The main geometry is optically centered in a 512×512 viewBox.

## Canonical files
- `tutorbench-mark.svg` — transparent primary mark, blue→violet gradient
- `tutorbench-mark-mono-dark.svg` — single-color dark mark
- `tutorbench-mark-mono-light.svg` — single-color reversed mark
- `tutorbench-app-icon.svg` — rounded-square product/app icon
- `tutorbench-mark-small.svg` — optical small-size mark for 16–32 px

## Size policy
- 48 px and above: use the standard App icon / standard mark.
- 16–32 px: use the optical small-size variant.
- Do not regenerate a small icon by AI or independently redraw its curves.
- Do not add axes, code brackets, checkmarks, letters T/B, or extra nodes.

## Primary palette
- Deep blue: `#1A3CFF`
- Blue: `#2D7BFF`
- Violet: `#8A5CFF`
- Ink: `#0F172A`
- Cool panel: `#F3F6FF`

## Repository usage
Typical files:
- Web/favicon: `favicon.ico`, `favicon-16.png`, `favicon-32.png`
- README/docs: `tutorbench-mark.svg` or mono-dark SVG
- Windows app: `tutorbench.ico`
- Large product surfaces: `tutorbench-app-icon.svg` or 512/1024 PNG

## Clear-space rule
Keep at least one stroke-width of empty space outside the mark's visible bounds.
For the rounded-square App icon, do not crop inside the existing tile boundary.
