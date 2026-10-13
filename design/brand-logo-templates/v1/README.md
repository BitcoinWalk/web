# BitcoinWalk city-neutral logo source v1

This pack contains the twelve approved BitcoinWalk logos without city names:
round avatars, standalone symbols, horizontal wordmarks and vertical lockups.
Each family includes the available orange, ink and reversed treatment.

`source-pngs/` preserves the original supplied artwork. `editable-masters/`
contains self-contained SVG files that open correctly in Inkscape. The approved
raster is embedded in a locked layer so these files do not misrepresent raster
artwork as traced vector geometry. Use Inkscape to position or export a master;
do not redraw, stretch, recolour or rearrange the locked artwork.

To reproduce the pack from the original logo directory, run:

```sh
node scripts/import-global-brand-logo-pack.mjs "/path/to/Logo pack"
```

The import records every source checksum in `manifest.json` and also prepares
web previews and PNG/SVG downloads under `public/brand/inkscape/global/`.
