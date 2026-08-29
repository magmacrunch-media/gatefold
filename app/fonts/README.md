# app/fonts — the typefaces, self-hosted

Every face the app can draw with lives here, next to its licence. Tauri embeds
`app/` whole, so both the font and its licence ship inside the installed
binary rather than only in this repo.

## Why self-hosted at all

Nine of the fifteen faces in the font picker came off `fonts.googleapis.com`
in the web tool. Under the desktop CSP (`font-src 'self'`) that request is
blocked — and it fails **silently**, which is the part that matters. Every one
of them is `font-display: swap`, so the fallback has already painted by the
time the fetch dies. Nothing looks broken, nothing logs, and the exported PNG
is simply rendered in the wrong typeface.

Self-hosting is the fix and it is not optional. It is also only half of it:
a face that has not finished loading still draws as the fallback, and the
canvas does not redraw when it arrives. `ui/canvas.js` waits on
`document.fonts.ready`; `ui/export.js` awaits `document.fonts.load()` for
every face in use before it composites.

## What is here

| Family | File | Size | Licence |
|---|---|---|---|
| Press Start 2P | `PressStart2P-Regular.woff2`, `.ttf` | 12K | `PressStart2P-OFL.txt` |
| Courier Prime | `CourierPrime-Regular.woff2`, `-Bold.woff2` | 40K | `CourierPrime-OFL.txt` |
| VT323 | `VT323-Regular.ttf` | 152K | `VT323-OFL.txt` |
| Silkscreen | `Silkscreen-Regular.ttf` | 32K | `Silkscreen-OFL.txt` |
| DotGothic16 | `DotGothic16-Regular.ttf` | 2.0M | `DotGothic16-OFL.txt` |
| Space Mono | `SpaceMono-Regular.ttf` | 100K | `SpaceMono-OFL.txt` |
| Bebas Neue | `BebasNeue-Regular.ttf` | 60K | `BebasNeue-OFL.txt` |
| Pixelify Sans | `PixelifySans-Variable.ttf` | 80K | `PixelifySans-OFL.txt` |
| Oswald | `Oswald-Variable.ttf` | 172K | `Oswald-OFL.txt` |
| Playfair Display | `PlayfairDisplay-Variable.ttf` | 296K | `PlayfairDisplay-OFL.txt` |
| Inter | `Inter-Variable.ttf` | 860K | `Inter-OFL.txt` |

Press Start 2P and Courier Prime are declared by `app/shell/fonts.css`, which
is the shell's file and is already the one deliberately forked shell file —
a pure `../../fonts/` to `../fonts/` path swap of the website's copy, because
`url()` resolves against the stylesheet and `var()` cannot interpolate into
`url()`. **Do not add faces to it.** The other nine belong to the app and are
declared by `app/ui/typefaces.css`.

The four remaining picker options — Times New Roman, Georgia, Impact, Arial —
are system faces and need nothing.

## Where they came from, and why TTF

`github.com/google/fonts`, under `ofl/<family>/`, which is the upstream and
the only source that also publishes the licence. It ships **TrueType only** —
there is no `.woff2` in that repo, and for Pixelify Sans, Oswald, Playfair
Display and Inter there is no static instance either, only the variable file.

That is why this directory is 4 MB rather than the ~500 KB a set of subset
woff2 files would be. `fonts.gstatic.com` would serve those, but it serves no
licence file, and the OFL requires one to travel with the font. A bundled
desktop app pays this once, at install; it is not a per-page download.

`DotGothic16-Regular.ttf` is 2 MB on its own because it carries full CJK
coverage. That is not waste — it is a Japanese face, and an album cover is a
plausible place to want Japanese text.

### Adding a face

Take both the font **and** the `OFL.txt` from that family's own directory in
`google/fonts`. The copyright line differs per family and it is exactly the
part the licence requires; a copy borrowed from another family is the wrong
licence file even though the terms match.

Then declare it in `app/ui/typefaces.css` at `font-weight: 400` — including
variable files. `ui/render.js` draws text as `` `${fontSize}px "${font}"` ``,
which is CSS `font-weight: normal` and no style, so pinning the `wght` axis to
the single instance the canvas can ask for keeps a future stylesheet from
making the browser synthesise a bold this app never draws.

## Licensing

Every family here is under the **SIL Open Font License 1.1**. Clause 2 requires
the licence to be distributed with the fonts, which is why each `*-OFL.txt`
sits beside its font inside `app/` rather than being collected into one file
at the repo root: what ships is what is in the bundle.
