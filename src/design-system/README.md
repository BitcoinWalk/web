# BitcoinWalk design foundation

The product uses shared orange, ink and paper tokens, Outfit body text and Syne headings. Light/dark/system appearance is the only theme preference stored in the browser.

- `tokens.css`: semantic colours, typography, spacing and control dimensions.
- `primitives.module.css`: shared buttons, action pairs and panels.
- `theme-provider.tsx`: the light/dark appearance control.
- `walk-progress.tsx`: Walk / Access / Plan registration progress.
- `../app/start/start.module.css`: responsive stepped form.

The walk description editor uses Tiptap and preserves Markdown as its stored format. Registration drafts retain only permitted form fields for seven days; signer secrets and payment data are excluded.

Hero photo rotation and other motion respect reduced-motion preferences. Icon-only actions use readable glyphs and touch-friendly targets. The selected design is fixed; designer galleries, typography experiments and local service tooling are not part of this product branch.
