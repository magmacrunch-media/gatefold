// core/element.js — what an element IS. No drawing, no DOM, no ids from the page.
//
// The web tool built elements as object literals in two places (the shape
// branch of tools.js onMouseDown, and createTextElement), each reading its
// defaults straight out of the property panel with document.getElementById.
// That is why neither could be tested and why the two literals had drifted:
// the shape one carried wave fields on every element including rectangles,
// the text one carried none and also omitted the wave defaults a text element
// never needs. Here the style comes in as a parameter and the per-type
// defaults are a table.
//
// Pure by the rule in AGENTS.md: no DOM, no fetch, no Tauri, and it runs in a
// bare vm realm in tests, so no structuredClone and no crypto.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const WAVE_TYPES = ['sine', 'squarewave', 'sawtooth', 'trianglewave', 'step', 'pulse'];

    const SHAPE_TYPES = ['rect', 'circle', 'line', 'triangle', 'pentagon', 'hexagon',
        'diamond', 'star', 'arrow', 'roundrect'];

    const TYPES = SHAPE_TYPES.concat(WAVE_TYPES, ['text', 'image', 'clipart']);

    /* Every field an element can carry, with the value it takes when nothing
       says otherwise. Fields are grouped by who reads them.

       `visible` is new in the desktop build — the layers panel needs a way to
       hide something without deleting it. There is no migration for it
       because the file format is new; ui/render.js and geometry.hitTest both
       test `visible !== false` so an element from anywhere, including one
       hand-written into a file, is visible unless it says it is not.

       `locked` is read the same way round and for the same reason: only an
       explicit true locks, so anything from anywhere is movable unless it
       says otherwise. It exists because a photo fitted with COVER has the
       whole canvas for a bounding box, and every click that misses the text
       on top of it grabbed the photo instead. A locked element is skipped by
       hit testing entirely, so the click reaches whatever is above it. */
    const COMMON = {
        id: 0, type: 'rect', x: 0, y: 0, w: 0, h: 0,
        fill: '#ffffff', stroke: '#000000', strokeWidth: 4,
        rotation: 0, opacity: 100,
        visible: true, locked: false, name: '',
    };

    const WAVE = { wavelength: 5, waveMode: 'filled', steps: 5, duty: 0.2 };
    const TEXT = { text: '', font: 'Press Start 2P', fontSize: 48 };
    const IMAGE = { src: null, aspectRatio: 1, origW: 0, origH: 0 };
    const CLIPART = { clipartId: null };

    function isWave(type) { return WAVE_TYPES.indexOf(type) !== -1; }

    /* Fill and stroke are part of how every element is drawn EXCEPT an image,
       which draws its own pixels. ui/import.js stamps 'none' on both when it
       places one, so that touching the stroke width slider cannot draw a
       border round a photo — and ui/props.js must not read that back into the
       panel. The panel's colours are also the style the NEXT element is born
       with, so one import would otherwise leave every later shape and every
       later line of text with no fill and no stroke: drawn, counted,
       selectable, and completely invisible. That was the bug.

       Unknown types are stylable. A type this list has not heard of is far
       more likely to be a shape than a second kind of bitmap, and the failure
       from guessing wrong that way is visible rather than silent. */
    const STYLELESS_TYPES = ['image'];

    function stylable(type) { return STYLELESS_TYPES.indexOf(type) === -1; }

    /** The extra fields a type carries beyond COMMON. */
    function extrasFor(type) {
        if (isWave(type)) return WAVE;
        if (type === 'text') return TEXT;
        if (type === 'image') return IMAGE;
        if (type === 'clipart') return CLIPART;
        return null;
    }

    function defaultsFor(type) {
        const out = Object.assign({}, COMMON, { type: type });
        const extras = extrasFor(type);
        if (extras) Object.assign(out, extras);
        return out;
    }

    /* ── ids ──
       THE COUNTER MUST BE RE-SEEDED WHEN A FILE IS LOADED. The web tool
       started idCounter at 0 every session and had no way to load anything,
       so it never hit this. Open a file holding ids 1..12 into a fresh
       session and the next element created is id 1 as well; selection is
       `elements.find(e => e.id === selectedId)`, which then returns the older
       of the two, and Delete removes whichever it finds first. That is silent
       data loss, and seedIds is asserted directly because of it — the same
       bug, one level up, that artstore.adopt() re-seeds against. */
    let seq = 0;

    function nextId() { return ++seq; }

    function seedIds(elements) {
        seq = 0;
        for (const el of elements || []) {
            const n = Number(el && el.id);
            if (isFinite(n) && n > seq) seq = n;
        }
        return seq;
    }

    /** Only for suites that need a known starting point. */
    function resetIds() { seq = 0; }

    /**
     * Make an element.
     *
     * `props` is whatever the caller knows — the geometry it was dragged out
     * to, and the style read off the property panel by ui/props.js. Unknown
     * keys are kept: a caller that knows about a field this table does not is
     * a caller ahead of this file, not a caller to silently ignore.
     */
    function create(type, props) {
        const el = defaultsFor(type);
        el.id = nextId();
        if (props) Object.assign(el, props, { type: type });
        return el;
    }

    /**
     * Fold a negative width or height back into the origin.
     *
     * Dragging up and to the left produces w < 0, and every hit test, bounds
     * calculation and fill in the app assumes x,y is the top-left corner. The
     * web tool normalised inside getElementBounds instead, which meant the
     * STORED element stayed inside-out and every consumer had to remember.
     *
     * LINE IS EXEMPT, and that is not an oversight: for a line w and h are a
     * direction, not a size. Normalising one would silently flip a line drawn
     * up-and-right into one drawn down-and-left.
     */
    function normalize(el) {
        if (!el || el.type === 'line') return el;
        if (el.w < 0) { el.x += el.w; el.w = -el.w; }
        if (el.h < 0) { el.y += el.h; el.h = -el.h; }
        return el;
    }

    /** A label for the layers panel when the element has no name of its own. */
    function describe(el) {
        if (!el) return '';
        if (el.type === 'text') return (el.text || '').split('\n')[0].slice(0, 32);
        return '';
    }

    App.element = {
        TYPES: TYPES,
        WAVE_TYPES: WAVE_TYPES,
        SHAPE_TYPES: SHAPE_TYPES,
        COMMON: COMMON,
        isWave: isWave,
        STYLELESS_TYPES: STYLELESS_TYPES,
        stylable: stylable,
        defaultsFor: defaultsFor,
        create: create,
        normalize: normalize,
        describe: describe,
        nextId: nextId,
        seedIds: seedIds,
        resetIds: resetIds,
    };
}());
