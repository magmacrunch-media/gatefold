// core/gatefold.js — the document, and the .gatefold file.
//
// The web tool had no document: `let elements = []` and `let selectedElement`
// lived in app.js's IIFE alongside forty-five event listeners, the canvas
// size lived in canvas.js, and there was no way to write any of it down.
// Reloading the page lost everything, silently. This file is the gap a
// desktop build exists to close.
//
// The FILE FORMAT is shaped on deck-forge/app/core/deckforge.js, and the
// shape is worth copying exactly:
//
//   - a FORMAT_VERSION, and a refusal to open a future major
//   - TOP_LEVEL as a declared CONSTANT rather than "whatever keys the object
//     has". deck-forge learned this the hard way: gating on `key in doc`
//     looked equivalent and was not, because a loaded document rebuilt as a
//     bare literal is missing every field the FILE omitted, so setting one
//     afterwards silently did nothing. Gating on a constant makes that bug
//     unreachable rather than merely fixed once.
//   - MERGE OVER A FULL DEFAULT on load, never a literal built from the
//     file's keys. A file that omits a field must leave the default standing,
//     not leave a hole.
//   - the art map as a SIBLING of the document, never on the elements.
//
// Pure: no DOM, no fetch, no Tauri. It hands out and takes in plain data;
// ui/project-ui.js does the dialogs and the bytes.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const FORMAT_VERSION = '1.0';
    const FILE_TYPE = 'gatefold';
    const EXT = 'gatefold';

    /* THE FIELD LIST. Adding a document field means adding it here and to
       emptyDoc(); nothing infers this from the object. */
    const TOP_LEVEL = ['name', 'size', 'bgColor', 'elements'];

    const SQUARE_SIZES = [512, 1024, 2048, 4096];
    const DEFAULT_SIZE_PX = 1024;
    const DEFAULT_BG = '#ffffff';

    /* Warn rather than refuse. A 4096 cover with two print-resolution photos
       is genuinely tens of megabytes of base64, and that is the honest cost
       of a self-contained single file. The way out later is write_bytes —
       already on the Rust allowlist — into a zipped pack; the dedupe in
       artstore already means one payload however many elements point at it. */
    const LARGE_FILE_BYTES = 64 * 1024 * 1024;

    /**
     * THE SIZE IS STRUCTURED, AND THAT IS THE POINT.
     *
     * The web tool's canvas was one integer, because every cover it could make
     * was a square in pixels. CD wallets, digipak panels and cassette J-cards
     * are the direction this is going, and they are millimetres with a bleed
     * and a safe margin — so the size is stored in the shape deck-forge's
     * print geometry already speaks, from the first version of the format:
     *
     *   today   { unit: 'px', trim: { w, h }, bleed: 0, safe: 0 }
     *   later   { unit: 'mm', trim: { w: 121, h: 121 }, bleed: 3, safe: 3, dpi: 300 }
     *
     * `unit` selects only whether a DPI conversion is involved. Element
     * coordinates are in document units with the ORIGIN AT THE TOP-LEFT OF
     * THE TRIM BOX, so bleed lives at negative coordinates and changing it
     * later never translates existing art. None of that needs a migration —
     * which is the whole reason it is here now rather than being a bare
     * integer and a v2.0 to write later.
     */
    function squareSize(px) {
        return { unit: 'px', trim: { w: px, h: px }, bleed: 0, safe: 0 };
    }

    function defaultSize() { return squareSize(DEFAULT_SIZE_PX); }

    /** The one number the square code paths still want. */
    function canvasSize(size) {
        return (size && size.trim && size.trim.w) || DEFAULT_SIZE_PX;
    }

    function isSquarePx(size) {
        return !!size && size.unit === 'px' && size.trim && size.trim.w === size.trim.h;
    }

    function emptyDoc() {
        return {
            name: 'untitled',
            size: defaultSize(),
            bgColor: DEFAULT_BG,
            elements: [],
        };
    }

    /* ── the live document ──────────────────────────────── */

    let doc = emptyDoc();

    function get() { return doc; }
    function set(next) { doc = next; return doc; }

    /** The undo snapshot. Deep, because restore must not alias the stack. */
    function clone() { return JSON.parse(JSON.stringify(doc)); }

    function reset() {
        doc = emptyDoc();
        App.element.resetIds();
        App.artstore.reset();
        return doc;
    }

    /* ── serialize ──────────────────────────────────────── */

    /** Every art ref the document actually points at, in first-use order. */
    function usedRefs() {
        const refs = [];
        for (const el of doc.elements) {
            if (el.src && refs.indexOf(el.src) === -1) refs.push(el.src);
        }
        return refs;
    }

    /**
     * What goes in the file.
     *
     * The art map is pruned to what the document references. The LIVE store
     * deliberately never evicts — undo can resurrect an element whose image
     * was deleted, and a store that dropped the bytes would restore an element
     * that cannot draw — but the undo stack is not written to disk, so what a
     * saved file needs is exactly the art the saved document points at.
     */
    function toProjectData() {
        const out = { type: FILE_TYPE, version: FORMAT_VERSION };
        for (const key of TOP_LEVEL) out[key] = doc[key];
        out.art = App.artstore.serialize(usedRefs());
        return out;
    }

    function stringify() {
        return JSON.stringify(toProjectData(), null, 2) + '\n';
    }

    /* ── migrations ─────────────────────────────────────── */

    /* Keyed by the version they migrate FROM, walked until no entry matches.
       Empty at 1.0, and that is fine — the chain is the mechanism, and it
       costs nothing to have it in place before the first migration exists. */
    const MIGRATIONS = {};

    function majorOf(v) { return parseInt(String(v).split('.')[0], 10) || 0; }

    /* ── deserialize ────────────────────────────────────── */

    /**
     * Adopt a parsed .gatefold file.
     *
     * Returns { doc } or { error }. An error is a message for a person: it
     * names both versions when a file is too new, because "cannot open" without
     * saying what would open it is not actionable.
     *
     * THE ORDER MATTERS AND EACH STEP IS LOAD-BEARING:
     *   1  refuse anything that is not one of ours
     *   2  walk the migration chain
     *   3  refuse a future MAJOR (a future minor is readable by design)
     *   4  merge over a full default — never build from the file's keys
     *   5  adopt the art, which RE-SEEDS the ref counter
     *   6  re-seed the ELEMENT id counter
     *
     * Steps 5 and 6 are the same bug at two levels. artstore.adopt re-seeds
     * because a file holding img1..img9 loaded into a store whose counter is 0
     * would have the next import allocate img1, and register() would hand back
     * the LOADED art — the element silently shows the wrong picture. Element
     * ids have it too and the web tool could never hit it because it could not
     * load: idCounter started at 0 every session, so a file holding ids 1..12
     * gives the next new element id 1, selection is
     * `elements.find(e => e.id === selectedId)`, and Delete removes the wrong
     * one of the pair. Both are asserted directly.
     */
    function fromProjectData(data) {
        if (!data || data.type !== FILE_TYPE) {
            return { error: 'Not an GATE//FOLD project file' };
        }

        let d = data;
        let v = String(d.version || '1.0');
        while (MIGRATIONS[v]) {
            d = MIGRATIONS[v](d);
            v = String(d.version);
        }

        if (majorOf(v) > majorOf(FORMAT_VERSION)) {
            return {
                error: 'This project was saved by a newer GATE//FOLD'
                    + ` (file ${v}, this build reads ${majorOf(FORMAT_VERSION)}.x)`,
            };
        }

        const next = emptyDoc();
        for (const key of TOP_LEVEL) {
            if (d[key] !== undefined && d[key] !== null) next[key] = d[key];
        }
        /* size gets the same treatment one level down: a file that names a
           trim box but omits bleed must keep the default bleed, not undefined. */
        next.size = Object.assign(defaultSize(), d.size);
        if (d.size && d.size.trim) next.size.trim = Object.assign({}, next.size.trim, d.size.trim);

        App.artstore.adopt(d.art);
        App.element.seedIds(next.elements);

        doc = next;
        return { doc: doc };
    }

    function parse(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return { error: 'That file is not readable JSON' };
        }
        return fromProjectData(data);
    }

    App.gatefold = {
        FORMAT_VERSION: FORMAT_VERSION,
        FILE_TYPE: FILE_TYPE,
        EXT: EXT,
        TOP_LEVEL: TOP_LEVEL,
        SQUARE_SIZES: SQUARE_SIZES,
        DEFAULT_SIZE_PX: DEFAULT_SIZE_PX,
        LARGE_FILE_BYTES: LARGE_FILE_BYTES,
        squareSize: squareSize,
        defaultSize: defaultSize,
        canvasSize: canvasSize,
        isSquarePx: isSquarePx,
        emptyDoc: emptyDoc,
        get: get,
        set: set,
        clone: clone,
        reset: reset,
        usedRefs: usedRefs,
        toProjectData: toProjectData,
        stringify: stringify,
        fromProjectData: fromProjectData,
        parse: parse,
    };
}());
