# GATE//FOLD

A square album-cover editor. Shapes, waveforms, clip art, text and imported
photographs on a canvas from 512 to 4096 pixels, with an eyedropper that
samples off a reference image.

Desktop app built on [magma-kit](../magma-kit), and the same codebase behind
the web version at
[magmacrunch.com/ware/album-art-maker](https://magmacrunch.com/ware/album-art-maker/).

## Two builds

| | LITE — the web | FULL — the desktop |
|---|---|---|
| Draw, edit, rotate, undo | yes | yes |
| 19 element types, 27 clip-art icons | yes | yes |
| Import by button, drag-drop or paste | yes | yes |
| Reference-image eyedropper | yes | yes |
| Export PNG | yes | yes |
| Save and open `.gatefold` projects | — | yes |
| Layers panel | — | yes |
| Menu bar | — | yes |

LITE is exactly what is live on magmacrunch.com and does not lose features to
make the desktop build look better. See `core/tier.js`.

## Running it

```bash
npm install && (cd desktop && npm install)
npm run check                 # lint + tests
npm run serve                 # the LITE build on :3300
cd desktop && npm run dev     # the FULL build
```

magma-kit must be checked out as a sibling directory: the Rust crate is a path
dependency at `../../../magma-kit/crate`, and `npm run check:kit` needs it too.

## The `.gatefold` file

One JSON file holding the document and every image it uses, so a project is a
single thing you can move:

```jsonc
{
  "type": "gatefold",
  "version": "1.0",
  "name": "untitled",
  "size": { "unit": "px", "trim": { "w": 1024, "h": 1024 }, "bleed": 0, "safe": 0 },
  "bgColor": "#ffffff",
  "elements": [ /* ... each carrying an art REF, never a payload */ ],
  "art": { "img1": { "kind": "raster", "name": "cover.jpg", "payload": "data:..." } }
}
```

Two things about it are deliberate.

**Images are referenced, not embedded in the element.** An element carries
`"src": "img1"`; the bytes live once in the art map. album//art measured what
happens otherwise: one 1600×1600 photo cost 11.2 MB per undo state, 571 MB
across the stack, and 11.4 ms of `JSON.stringify` on every property tweak —
against 0.02 ms with a ref. The same image on ten elements costs one payload.

**The size is structured from version 1.0**, in the shape print geometry
already speaks. Today every cover is `unit: "px"` and square. A CD wallet or a
cassette J-card is the same field with `unit: "mm"`, a trim box in
millimetres, a bleed and a DPI — and no migration, because element coordinates
are already in document units with the origin at the top-left of the trim box.

## Layout

- `app/core/` — pure logic, no DOM. The document, the file format, the
  geometry, the waveforms, the icon data. Tested in Node.
- `app/ui/` — the canvas, the panels, the dialogs, the Tauri bridge.
- `app/kit/`, `app/shell/` — vendored. Generated; do not edit here.
- `desktop/` — the Tauri shell and ten named commands.

`AGENTS.md` has the conventions, the two temporary copies awaiting promotion
into magma-kit, and the five bugs the port fixed that are still live on the
website.

## Licence

PolyForm Noncommercial 1.0.0. Clip art from [Lucide](https://lucide.dev)
(ISC); typefaces under the SIL Open Font License 1.1 — see `app/fonts/`.
