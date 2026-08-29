// ui/images.js — decoded bitmaps for art refs.
//
// core/artstore.js holds PAYLOADS (data URLs) keyed by ref, and is pure. This
// holds the decoded <img> for each ref, which is a DOM object and therefore
// cannot live in core/. The split is the same one the whole port runs on:
// what a Node suite can reason about goes in core/, what needs a browser
// stays here.
//
// THE ONE RULE: decoding is async and the canvas does not know that. An
// element pointing at a ref that has not finished decoding draws nothing, and
// something has to repaint when it arrives. The web tool did that by calling
// render(currentElements) from inside the img.onload handler in canvas.js —
// a second render path, reaching a module-level copy of the element array
// that could by then be stale. Here onload calls ONE callback that
// ui/session.js owns, so there is exactly one way the canvas is repainted.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const bitmaps = new Map();   // ref -> Image
    let onDecoded = null;

    /** ui/session.js hands in its render(). Called once per decode. */
    function init(callback) { onDecoded = callback || null; }

    /**
     * The decoded image for a ref, starting the decode if it has not begun.
     *
     * Returns null while decoding, and null forever for a ref the store does
     * not know — a missing image must not throw in the middle of a frame.
     */
    function bitmap(ref) {
        if (!ref) return null;

        const existing = bitmaps.get(ref);
        if (existing) return existing.complete && existing.naturalWidth ? existing : null;

        const payload = App.artstore.get(ref);
        if (!payload) return null;

        const img = new Image();
        /* Set before src: a data URL can complete synchronously in some
           engines, and a handler attached afterwards would never fire. */
        img.onload = function () { if (onDecoded) onDecoded(); };
        img.onerror = function () {
            /* Leave the entry in place. Removing it would have the next frame
               start the decode again, and a broken payload would then retry
               on every repaint forever. */
            if (window.Toast) Toast.show('AN IMAGE IN THIS PROJECT COULD NOT BE DECODED');
        };
        img.src = payload;
        bitmaps.set(ref, img);
        return img.complete && img.naturalWidth ? img : null;
    }

    /** Have all the refs this document uses finished decoding? */
    function allReady(refs) {
        for (const ref of refs) {
            const img = bitmaps.get(ref);
            if (!img || !img.complete || !img.naturalWidth) return false;
        }
        return true;
    }

    /**
     * Decode every ref and resolve when they are all in.
     *
     * Export needs this: compositing while a bitmap is still decoding writes a
     * PNG with a hole in it, and the only sign is the exported file.
     */
    function ready(refs) {
        return Promise.all((refs || []).map(function (ref) {
            const payload = App.artstore.get(ref);
            if (!payload) return Promise.resolve();
            bitmap(ref);
            const img = bitmaps.get(ref);
            if (!img || (img.complete && img.naturalWidth)) return Promise.resolve();
            return new Promise(function (resolve) {
                const prevLoad = img.onload;
                const prevErr = img.onerror;
                img.onload = function () { if (prevLoad) prevLoad(); resolve(); };
                // Resolve rather than reject: one unreadable image must not
                // stop the other twenty from being exported.
                img.onerror = function () { if (prevErr) prevErr(); resolve(); };
            });
        }));
    }

    /* Cleared with the document, not with the element. The artstore keeps
       payloads through an undo that resurrects a deleted element, and these
       have to survive alongside them for exactly the same reason. */
    function reset() { bitmaps.clear(); }

    App.images = {
        init: init,
        bitmap: bitmap,
        allReady: allReady,
        ready: ready,
        reset: reset,
    };
}());
