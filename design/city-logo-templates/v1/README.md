# BitcoinWalk city-logo source v1

This directory is the Figma-independent source package for the city-logo
automation workstream. SVG files use standard SVG plus Inkscape layer metadata,
so they can be opened and edited with the free, open-source Inkscape editor.

## Preservation and editable-master status

`reference-masters/` contains all ten approved exports for Warszawa, Radom and
Szydłowiec. Each SVG embeds the original, checksum-verified Figma PNG in a
locked layer. The PNG bytes are not traced, resampled or redrawn.

`editable-masters/` contains matching Inkscape SVGs. The approved brand artwork
remains a locked, exact raster layer and is not misrepresented as vector art.
Only the city label is replaced with live, editable Ubuntu Bold Italic text.
Each master retains the reviewed pilot's measured label width, size, baseline,
background and transparency intent. The thirty editable masters passed
dimensions, safety, brand-pixel and bounded rendered-difference checks against
the thirty immutable references.

The partial Figma SVG geometry captured before the Starter quota was reached is
retained as `figma-layouts.partial.json`. It is evidence for five layouts, not a
complete template and not an executable dependency.

## Font

`fonts/Ubuntu-BoldItalic.ttf` is the exact family and style used by the accepted
pilot labels. `fonts/UFL.txt` is its licence. Keep both files versioned with the
template so local, CI and VPS rendering use the same font rather than a system
fallback.

## Rebuild the preservation masters

From the repository root:

```sh
node scripts/migrate-city-logo-source-to-inkscape.mjs warszawa \
  /path/to/template-layouts.partial.json
```

The command verifies all source checksums, requires all ten variants, creates
self-contained Inkscape SVGs, checks rendered pixels against the approved PNGs,
and refuses to overwrite an existing source package.

Build the corresponding live-text masters with:

```sh
node scripts/build-city-logo-inkscape-masters.mjs warszawa
```

The build measures the approved label rather than stretching short names to a
long-name width. It also derives transparent versus opaque erasure from the
actual source image instead of assuming that an `on-white` filename contains a
background.

The original Figma working copy remains historical design evidence. New city
packs must ultimately render from a reviewed Inkscape template without calling
Figma, Framer or another hosted editor.
