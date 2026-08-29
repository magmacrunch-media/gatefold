# GATE//FOLD — conventions

## What this is

The desktop build of the album-cover editor that runs on magmacrunch.com. It
is the fourth app on `magma-kit`, alongside sprite-forge, magma-ops-app and
deck-forge, and it was ported out of `ware/album-art-maker` in the website
repo rather than written from scratch.

## Architecture

```
app/          the entire shipped frontend; Tauri's frontendDist
  kit/        VENDORED from magma-kit — GENERATED, do not edit here
  shell/      VENDORED chrome from magmacrunch.com ware/shell
  core/       pure logic: no DOM, no fetch, no Tauri. Tested in Node
  ui/         the DOM and IPC layer
  fonts/      self-hosted (CSP font-src 'self') — see app/fonts/README.md
desktop/      the Tauri shell only
tests/        dependency-free runner
  kit/        VENDORED from magma-kit — GENERATED, do not edit here
```

## Two tiers, one codebase

`magmacrunch.com` runs the **LITE** build; the bundle runs **FULL**. The
mechanism is the kit's: `Gatefold.fs` is undefined when there is no Tauri
backend, and its absence is the feature switch. The POLICY lives in exactly
one file, `core/tier.js`, so which features are desktop-only is a decision
someone made rather than an accident of what happens to be missing at a call
site.

**LITE never regresses from what is live on magmacrunch.com today.** Every
element type, the clip art, image import by all three routes, the reference
eyedropper, undo/redo and PNG export are in both tiers. A capability may only
be `full` when it is genuinely new work needing a filesystem or a window —
never to make the desktop build look better by taking something away from the
web one. `tests/tier.test.mjs` asserts that list.

The menu bar, the doc name and the layers panel are additionally CSS-gated on
`html.desktop`, which `kit/bridge-core.js` sets in `<head>` before the body
paints. Both gates on purpose: the CSS one stops a flash, the tier one stops
the code running.

## Classic scripts, not ES modules — deliberate, do not convert

Everything in `app/` is a classic script attaching to `window.Gatefold`. The
website is buildless and busts caches by stamping `?v=<hash>` onto
`<script src>` tags; an `import` specifier inside a .js file is invisible to
that stamper, so an ES-module `core/` would sit behind stale caches with no
way to force a refresh.

Load order in `app/ui/index.html` IS the dependency order, and `tests/run.mjs`
asserts it. The kit and `bridge.js` load in `<head>` — not at the end of
`<body>` — because `bridge-core.js` sets `html.desktop` and the chrome is
gated on it.

## core/ is pure; ui/ owns the browser

The split test is *does it need a `ctx` or a `document`*. It is what lets the
web build, the desktop build and the Node suites share one copy of every
decision. Two consequences worth knowing before moving anything:

- **Text measurement is injected.** `core/geometry.js` takes a
  `measure(text, font, size)` callback; `ui/canvas.js` backs it with a
  *scratch* context, because measuring means assigning `ctx.font` and doing
  that to the live context mid-frame changes the face of whatever draws next.
- **`geometry.resize()` returns a patch**, never a mutation and never a DOM
  write. The original wrote `getElementById('fontSize').value` from inside its
  resize branch, which is why the slider and the element could disagree after
  an undo.

If a `core/` module needs a shim to be tested, that is the signal it belongs
in `ui/`. `testkit/canvas-shim.mjs` arrives with the sync and is deliberately
unused.

## The two temporary copies

`app/core/artstore.js` is a byte-copy of deck-forge's, and `app/ui/menu.js` is
a copy of sprite-forge's. Both are deliberate and time-boxed: they move into
**magma-kit 0.2.0** and become a six-line wrapper and an actions map. Until
they do, **do not edit them here** — edit the original and re-copy, or the
promotion has two parents. The same goes for the `inStroke` latch in
`ui/session.js`, which is the third copy of a workaround for a kit wart that
0.2.0 removes.

## The bugs that were fixed in the port

The web tool at `ware/album-art-maker` is still live and still has all of
these. Fix bugs **here**, and expect the drift until the LITE build replaces
that page.

1. **Rotation was not hit-tested.** `render()` drew inside a rotation but the
   hit test compared the raw cursor against the *unrotated* box, so at any
   angle the clickable region was somewhere the element was not, and the
   chrome did not wrap it. `geometry.toLocal()` fixes it; the test asserts
   **both** directions, because only the "a point in the axis-aligned box now
   MISSES" half proves the old behaviour is gone.
2. **The rotation drag used an absolute angle**, which looked right only
   because the handle always sat above the unrotated centre. Once the handle
   turns with the element that grab starts offset, so it now applies a delta.
3. **`step` with `steps: 1` divided by zero**, producing NaN for every point
   of the path — a wave that silently vanishes. The slider floors at 2; a
   loaded file does not.
4. **Element ids restarted at 1 every session.** Harmless when nothing could
   be loaded, silent data loss the moment it can: Delete removes the wrong one
   of an id pair. `element.seedIds()` and `artstore.adopt()` are the same fix
   at two levels, and both are asserted directly.
5. **`updatePropsVisibility()` was inert.** `.prop-group { display: flex }` is
   an author rule and beats the UA's `[hidden] { display: none }`, so all ten
   groups it hides were always visible. One `[hidden] { display: none
   !important }` re-enables a function that was already correct.

## Fonts

Nine of the fifteen picker faces came off the Google Fonts CDN. Under
`font-src 'self'` that is blocked, and it fails **silently** because
`font-display: swap` has already painted the fallback — so the export is just
in the wrong typeface. All nine are self-hosted in `app/fonts/` with their
licences; see that directory's README before adding one. Self-hosting is only
half of it: `ui/canvas.js` waits on `document.fonts.ready` and `ui/export.js`
awaits `document.fonts.load()` per face before compositing.

## Commands

```
npm run check       lint + the Node suites. The gate.
npm run check:kit   am I behind magma-kit? Needs the sibling checkout.
npm run sync-kit    re-vendor app/kit/ and tests/kit/
npm run serve       the LITE build at localhost:3300
cd desktop && npm run dev     the FULL build
```

`app/kit/` and `tests/kit/` are written **only** by
`../magma-kit/scripts/sync.mjs`. Editing a vendored file in place is caught by
`npm run check`; being behind the kit is caught by `npm run check:kit`, which
is manual because it needs the sibling.

## Git

Commit as `magmacrunch media <magmacrunchmedia@gmail.com>`. No AI attribution
in commits, code comments, or docs.
