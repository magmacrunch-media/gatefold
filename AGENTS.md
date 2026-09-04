# GATE//FOLD — conventions

## What this is

The desktop build of the album-cover editor that runs on magmacrunch.com. It
is the fourth app on `magma-kit`, alongside sprite-forge, magma-ops-app and
deck-press, and it was ported out of `ware/album-art-maker` in the website
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
scripts/      dev-time tooling, never shipped — see The icon
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

## The icon

**The icon is code.** `scripts/make-icon.mjs` holds a palette, a 32x32 grid of
palette indices, a PNG encoder and an ICO writer — so changing the design is an
edit, not a round trip through an image editor and a re-export at eight sizes.
`node scripts/make-icon.mjs --print` draws the grid in the terminal.

Designing AT 32x32 is the point: that is the taskbar size, so the small case is
the one being drawn rather than the one being hoped for. Every larger size is a
whole-number scale of it.

**Three commands, and the third is not optional:**

```bash
node scripts/make-icon.mjs --size 1024 --out icon-source.png
cd desktop && npx tauri icon ../icon-source.png && cd ..
node scripts/make-icon.mjs --icons desktop/src-tauri/icons
node scripts/make-icon.mjs --favicon app/ui/favicon.png
```

`tauri icon` produces all 52 platform variants, which is what we want, but it
scales with a **smooth** filter — measured on this design, it turned five
colours into **180** at 32x32. The third command overwrites every whole
multiple of the grid with an exact nearest-neighbour render and rebuilds
`icon.ico`. The odd Store tile sizes (30, 44, 71, 89...) are not multiples of
32 and keep the CLI's output; nobody looks closely at those.

The fourth writes the favicon from the SAME grid. sprite-forge's `favicon.svg`
is the source of its desktop icon set; deck-press broke that link and has no
favicon at all. One grid, both outputs, so the tab and the taskbar cannot
drift.

`tests/icon.test.mjs` asserts every pixel of `32x32.png` is exactly a palette
colour, which a resampled file cannot be — a blend of two palette colours is by
construction a third thing. Skip the third command and `npm run check` fails
with the command to fix it. deck-press documents the same rule as prose and has
no test, so skipping it there is silent.

**Changing an icon does not rebuild the binary.** `tauri-build` emits
`cargo:rerun-if-changed` for `tauri.conf.json` and `capabilities/` only, so a
build after swapping icons succeeds while leaving the old icon compiled into
the Windows resource. `touch desktop/src-tauri/tauri.conf.json` first, and
verify against the built exe rather than the source files. See
`SHORTCUT_GUIDE.md`.

## What is still a copy

`app/core/artstore.js` and `app/ui/menu.js` are **done** — both moved into
magma-kit 0.2.0 and what is left here is a one-line wrapper and an actions map.
The `inStroke` latch in `ui/session.js` went with them, because 0.2.0's
`beginStroke` is idempotent.

What remains is `scripts/make-icon.mjs`, which is a copy of deck-press's with a
different design and palette. By the kit's own rule — a module gets in when a
SECOND app has hand-rolled it — it now qualifies. It has not moved because
magma-kit vendors `js/` and `testkit/` only: a build script would be a new
category of shared file needing a new sync path, which is more design than two
copies strictly earns. Recorded as a candidate in `magma-kit/README.md`. Until
it moves, edit the design here freely — the two apps' designs are supposed to
differ — but keep the encoders below the `DESIGNS` registry in step with
deck-press's.

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

## Print output

**THE EXPORTED FILE HAS TO SAY HOW BIG IT IS.** `ui/export.js` composes at
`m.surface`, so a JP0 J-card is already the right 1275 x 1313 dots — but a
canvas encodes to PNG with no `pHYs` chunk, and a PNG without one states no
physical size at all. Every reader then supplies its own default, 72dpi in
most of the Adobe tools and 96 in most Windows ones, and a 4-inch card places
at over sixteen. `core/pngmeta.js` writes the chunk; `export.js`'s `encode()`
is the only place it happens.

`encode()` serves BOTH builds, and the LITE download went from `toDataURL` to
a Blob to make that possible — the stamp works on bytes and a data URL has
none to reach. Nothing about what LITE writes changes: its four square sizes
have a null dpi, which `stampDpi` returns untouched, exactly as a document
measured in pixels should. `pHYs` is quantised to whole pixels per metre, so
300dpi stores as 11811 and reads back 299.9994; that is the format's
precision, not a defect, and `tests/pngmeta.test.mjs` compares with a
tolerance sized to it.

**CROP AND FOLD MARKS ARE OPT-IN, AND THAT IS NOT TIMIDITY.** They cannot go
in the bleed — the bleed is artwork the knife takes away, so a mark there is
printed over the photograph AND thrown away by the cut it was meant to guide.
So marks need paper outside the bleed, and a marked export is a BIGGER IMAGE:
`core/marks.js` puts the surface on a sheet with a margin of one and a half
bleeds all round, which for a JP0 is 1387 x 1425 rather than 1275 x 1313. The
card inside it does not change. Every print export so far has been exactly
`m.surface`, and quietly returning different dimensions would break anyone who
had measured one, which is why it is a File-menu toggle remembered in
`gatefold.export` rather than a new default.

Everything in `marks.js` is in units of the bleed, so a format declaring 3mm
gets marks in proportion without a second table of print dimensions beside
`formats.js`'s. The margin is **rounded to whole dots** because it is where
`export.js` draws the composed artwork into the sheet, and `drawImage` at a
fractional offset resamples every pixel — a 300dpi card would arrive slightly
soft with nothing on screen to show for it. Crop marks are solid and fold
marks dashed, which is the printing convention and deliberately NOT the screen
overlay's, where the solid line IS the fold.

**THE OVERLAY IS NON-PRINTING, AND THAT INCLUDES THE PANEL NAMES.** `FRONT`,
`SPINE`, `BACK` and `FLAP n` are a fourth `kind` out of `panels.lines()`, sat
in the margin band between each panel's leading edge and its safe line. Like
the folds they are non-printing by never being asked for: `session.js` passes
`panels` and `export.js` does not. A document with no panels is not labelled —
`boxes()` calls the whole trim `PAGE` so the rest of that file needs no branch
for a square, which is a convenience for the code and not a fact about the
document.

## Panels that run across, and names that do not fit

The CD tray card and the 4-page booklet spread are the first formats whose
panels run **across** rather than stacking: `panelAxis: 'x'`, which
`core/panels.js`, `core/marks.js` and `ui/render.js` had all implemented since
print formats landed and nothing had used. A 12-inch record jacket is the
other new shape — a safe margin with **no panels at all**, which is why
`menu.js` no longer gates the guides overlay on the panel count. It asks what
the overlay would actually draw, because a jacket has a quarter inch of safe
margin and no folds, and the old test called that nothing.

**A panel can be narrower than its own name.** A tray card's spines are a
quarter inch — 75 dots at 300dpi, where the word SPINE wants about 85 and
lands on top of BACK. `panels.lines()` reports a `room` on every label and
`render.js` measures the name against it, drawing nothing when it will not
fit, because measuring text needs a `ctx` and that is the line between `core/`
and `ui/`. A tray card therefore labels BACK and leaves its spines bare, which
is the honest outcome: the two narrow panels at the ends are self-evidently
the spines, and SPINE printed over BACK tells you less than nothing.

Formats are pinned to published manufacturer templates, **in the unit the
template publishes**. The CD tray card is exact in both millimetres and inches
and the two are not exact conversions of each other — the vendor rounded, and
they differ by five microns — so `formats.test.mjs` asserts both and states
that rounding as the tolerance rather than picking one column and pretending
the other does not exist.

What is deliberately missing stays missing: the U-card (panel order and
hub-hole geometry unpublished), digipaks and wallets (panel counts published,
panel measurements not), and the LP gatefold, whose spine width depends on how
many records are inside — a job specification, not a format.

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

## Releases

`.github/workflows/release.yml` builds both platforms and attaches them to a
release. Push a tag to publish; run it from the Actions tab (`workflow_dispatch`)
to build without publishing, which is how you prove a change before tagging it.

**macOS cannot be cross-compiled from Windows.** Tauri links against the system
WebKit and produces a real `.app`, so a Mac bundle has to be built on a Mac.
That is the whole reason CI exists here — and once Mac has to go through it,
Windows goes too, so both halves of a release come from the same place and are
reproducible.

**The workflow checks out magma-kit alongside this repo, by name.** It has to:
`desktop/src-tauri/Cargo.toml` declares `magma-kit = { path =
"../../../magma-kit/crate" }`, so a lone checkout does not build. There is an
explicit step that fails with a sentence when the sibling is missing rather
than letting cargo's resolver explain it, because that error is opaque the
first time you see it.

macOS builds `--target universal-apple-darwin`: one `.dmg` native on both Apple
Silicon and Intel. Bigger and slower to build, but a single download that
cannot be the wrong one.

Bumping the version means **five** files — `package.json`,
`desktop/package.json`, `desktop/src-tauri/Cargo.toml`, `tauri.conf.json` and
the footer in `app/ui/index.html`. `tests/version.test.mjs` fails if they
disagree, with Cargo.toml as the source of truth. `Cargo.lock` records the
version too, so refresh it or a `--locked` build will complain.

Neither build is signed, so both systems block the first launch. See the
install section in `README.md` for what users actually see and how to get past
it; it is worth repeating in every release's notes, because a Mac claiming the
app "is damaged" reads as a corrupt download rather than a missing certificate.

## Git

Commit as `magmacrunch media <magmacrunchmedia@gmail.com>`. No AI attribution
in commits, code comments, or docs.
