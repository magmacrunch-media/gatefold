// ui/canvas.js — the <canvas> element itself: its size, its coordinates, and
// the one place a repaint is scheduled.
//
// Two things here are deliberate and were not in the web tool.
//
// THE MEASURER USES A SCRATCH CONTEXT. core/geometry.js measures text through
// an injected function, and this supplies it. It must not use the visible
// canvas's context: measuring means assigning ctx.font, and doing that to the
// live context part-way through a frame would change the face of whatever is
// drawn next. A 1x1 offscreen canvas costs nothing and cannot interfere.
//
// REPAINTS ARE COALESCED THROUGH requestAnimationFrame. The original redrew
// synchronously on every mutation, which during a drag meant a full redraw
// per mousemove — at 4096 with a photo, several per frame, all but the last
// of them discarded by the compositor anyway.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    let canvas = null;
    let ctx = null;
    let scratch = null;
    let paint = null;        // supplied by ui/session.js: what to draw
    let pending = 0;
    /* Where the TRIM's top-left sits on the surface — the bleed, for a print
       document, and zero for everything else. ui/render.js translates by it;
       toCanvas() takes the same number back off. */
    let originX = 0;
    let originY = 0;

    function init(el, drawFn) {
        canvas = el;
        ctx = canvas.getContext('2d');
        paint = drawFn;

        const s = document.createElement('canvas');
        s.width = 1;
        s.height = 1;
        scratch = s.getContext('2d');

        /* A face that has not finished loading draws as the fallback, and the
           canvas does not repaint itself when it arrives. Without this the
           first paint of a cover using any of the nine self-hosted faces is
           silently in the wrong typeface until something else forces a
           redraw. ui/export.js does the same check per face before it
           composites, which is the half that reaches the exported file. */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { schedule(); }).catch(function () {});
        }
    }

    function element() { return canvas; }
    function context() { return ctx; }

    /** The measurer core/geometry.js takes. Never the live context. */
    function measure(text, font, fontSize) {
        if (!scratch) return String(text).length * fontSize * 0.6;
        scratch.font = `${fontSize}px "${font}"`;
        return scratch.measureText(String(text)).width;
    }

    /**
     * Resize the backing store. Callers pass document units — the SURFACE,
     * which for a print document is the trim plus bleed on all four sides.
     *
     * `h` may be omitted, and omitting it means a square, so any call site
     * that predates print formats is still correct rather than subtly wrong.
     *
     * `origin` is where the trim's top-left lands on that surface.
     * ui/render.js translates by it and toCanvas() subtracts it, so a pointer
     * and a drawn pixel cannot disagree about where the artwork is.
     */
    function setSize(w, h, origin) {
        if (!canvas) return;
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h == null ? w : h));
        originX = (origin && origin.x) || 0;
        originY = (origin && origin.y) || 0;
        schedule();
    }

    function width() { return canvas ? canvas.width : 0; }
    function height() { return canvas ? canvas.height : 0; }
    function origin() { return { x: originX, y: originY }; }

    /**
     * A pointer event in DOCUMENT coordinates.
     *
     * The element is laid out to fit the window and the backing store is
     * 512..4096, so the two scales differ by a lot; every hit test depends on
     * this conversion being exact.
     *
     * The origin comes off at the end, and it is the identical float
     * ui/render.js added — not a second scale factor and not a rounding — so
     * a click in the bleed lands at a negative coordinate, which is exactly
     * where the artwork there is.
     */
    function toCanvas(e) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width) - originX,
            y: (e.clientY - r.top) * (canvas.height / r.height) - originY,
        };
    }

    /**
     * Document units per screen pixel.
     *
     * The same ratio toCanvas() uses, exposed because a tolerance that is
     * meant to FEEL the same at every canvas size has to be stated in screen
     * pixels and converted here. Four document units is half a handle on a
     * 512 cover and a rounding error on a 4096 one.
     */
    function scale() {
        if (!canvas) return 1;
        const r = canvas.getBoundingClientRect();
        return r.width ? canvas.width / r.width : 1;
    }

    /** Ask for a repaint. Many calls in one frame produce one paint. */
    function schedule() {
        if (pending || !paint) return;
        pending = requestAnimationFrame(function () {
            pending = 0;
            paint();
        });
    }

    /** Paint now — for the one caller that must not wait: export. */
    function flush() {
        if (pending) { cancelAnimationFrame(pending); pending = 0; }
        if (paint) paint();
    }

    App.canvas = {
        init: init,
        element: element,
        context: context,
        measure: measure,
        setSize: setSize,
        width: width,
        height: height,
        origin: origin,
        toCanvas: toCanvas,
        scale: scale,
        schedule: schedule,
        flush: flush,
    };
}());
