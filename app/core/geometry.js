// core/geometry.js — where every element is, and what the cursor is over.
//
// This is the heart of the port. In the web tool the same arithmetic lived in
// two files and could be run from neither: getElementBounds sat in canvas.js
// and called ctx.measureText against a module-level context, and hit testing,
// handle placement and all four resize branches sat in tools.js and wrote
// their results straight onto the element (and, for text, straight into the
// DOM). Two changes make the whole of it testable:
//
//   1. TEXT MEASUREMENT IS INJECTED. Nothing here owns a canvas. `measure` is
//      (text, font, fontSize) -> width; ui/canvas.js backs it with a SCRATCH
//      context, so setting ctx.font to measure cannot disturb a render that
//      is part-way through drawing something else.
//
//   2. RESIZE RETURNS A PATCH. It does not mutate and it does not touch the
//      page. The original wrote document.getElementById('fontSize').value
//      from inside its text branch, which is why the font slider and the
//      element could disagree after an undo.
//
// AND THE BUG THIS FILE EXISTS TO FIX: rotation. render() draws each element
// inside a rotation about the centre of its unrotated bounds, but the old
// hitTest compared the raw cursor position against that same unrotated box.
// At any non-zero rotation the clickable region was somewhere the element no
// longer was, and the selection chrome did not wrap it either. toLocal() puts
// the point back into the element's own frame, about THE SAME CENTRE the
// renderer turns about — anything else is right at 0 degrees and wrong
// everywhere else.
//
// Pure: no DOM, no canvas, no Tauri. Bare vm realm in tests.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /** Selection padding. The chrome is drawn at this inset and the hit box
        is grown by it, so what you can click is what you can see. */
    const PAD = 6;
    const HANDLE = 12;      // half-size of a corner handle's hit square
    const ROT_REACH = 24;   // how far above the box the rotation handle sits
    const ROT_RADIUS = 12;
    const MIN_SIZE = 2;
    const MIN_FONT = 8;

    const DEG = Math.PI / 180;

    /* ── bounds ─────────────────────────────────────────── */

    /**
     * The element's axis-aligned box in its OWN frame — rotation not applied.
     *
     * Text is the only type whose box is not stored: it is whatever the glyphs
     * take, so it is measured. lineHeight is fontSize * 1.3, which is the
     * original's number and is load-bearing — change it and every multi-line
     * cover shifts.
     */
    function bounds(el, measure) {
        if (!el) return { x: 0, y: 0, w: 0, h: 0 };

        if (el.type === 'text') {
            const fontSize = el.fontSize || 48;
            const font = el.font || 'Press Start 2P';
            const lines = String(el.text || '').split('\n');
            const lineHeight = fontSize * 1.3;
            let maxW = 0;
            if (measure) {
                for (const line of lines) {
                    const w = measure(line, font, fontSize);
                    if (w > maxW) maxW = w;
                }
            }
            const w = maxW || 10;
            const h = lines.length * lineHeight || lineHeight;
            return { x: el.x, y: el.y, w: w, h: h };
        }

        /* Fold a negative extent, because x,y is the top-left everywhere else
           in the app. element.normalize() does this to the stored element for
           every type that has a size; a line keeps its sign because for a line
           w,h is a direction, and only its BOX is folded here. */
        const w = el.w || 0;
        const h = el.h || 0;
        return {
            x: w < 0 ? el.x + w : el.x,
            y: h < 0 ? el.y + h : el.y,
            w: Math.abs(w),
            h: Math.abs(h),
        };
    }

    function centerOf(b) {
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    /* ── rotation ───────────────────────────────────────── */

    /**
     * Take a canvas-space point into the element's own unrotated frame.
     *
     * The exact inverse of the transform ui/render.js applies, about the same
     * centre. Round-tripping a point through toLocal and back is asserted,
     * because a centre that disagrees with the renderer's by even a little is
     * a hit box that drifts as the element rotates.
     */
    function toLocal(x, y, el, b) {
        const deg = (el && el.rotation) || 0;
        if (!deg) return { x: x, y: y };
        const c = centerOf(b);
        const a = -deg * DEG;
        const dx = x - c.x;
        const dy = y - c.y;
        return {
            x: c.x + dx * Math.cos(a) - dy * Math.sin(a),
            y: c.y + dx * Math.sin(a) + dy * Math.cos(a),
        };
    }

    /** The opposite: a point in the element's frame back into canvas space. */
    function toWorld(x, y, el, b) {
        const deg = (el && el.rotation) || 0;
        if (!deg) return { x: x, y: y };
        const c = centerOf(b);
        const a = deg * DEG;
        const dx = x - c.x;
        const dy = y - c.y;
        return {
            x: c.x + dx * Math.cos(a) - dy * Math.sin(a),
            y: c.y + dx * Math.sin(a) + dy * Math.cos(a),
        };
    }

    /**
     * The axis-aligned box that CONTAINS the rotated box.
     *
     * Used to place the W x H label, which stays unrotated because text at
     * 170 degrees is unreadable — so it needs somewhere to sit that clears
     * the turned element rather than the unturned one.
     */
    function envelope(b, deg) {
        if (!deg) return { x: b.x, y: b.y, w: b.w, h: b.h };
        const a = deg * DEG;
        const cos = Math.abs(Math.cos(a));
        const sin = Math.abs(Math.sin(a));
        const w = b.w * cos + b.h * sin;
        const h = b.w * sin + b.h * cos;
        const c = centerOf(b);
        return { x: c.x - w / 2, y: c.y - h / 2, w: w, h: h };
    }

    /* ── hit testing ────────────────────────────────────── */

    function inPaddedBox(x, y, b, pad) {
        const p = pad == null ? PAD : pad;
        return x >= b.x - p && x <= b.x + b.w + p
            && y >= b.y - p && y <= b.y + b.h + p;
    }

    /**
     * The topmost element under the point, or null.
     *
     * Top-down, because the array is bottom-first z-order and the thing you
     * see is the thing you meant to click.
     *
     * Invisible elements are skipped. A hidden element that still answered a
     * hit test would be selectable through whatever is drawn over it, which
     * reads as the app selecting the wrong thing.
     *
     * Known limitation, deliberately left: a line hit-tests as its bounding
     * box, so a long diagonal has a large region that selects it without the
     * cursor being near the stroke. Fixing it means point-to-segment distance
     * and a different answer for zero-length lines; it is not what this port
     * is for.
     */
    function hitTest(x, y, elements, measure, pad) {
        for (let i = (elements || []).length - 1; i >= 0; i--) {
            const el = elements[i];
            if (!el || el.visible === false) continue;
            const b = bounds(el, measure);
            const p = toLocal(x, y, el, b);
            if (inPaddedBox(p.x, p.y, b, pad)) return el;
        }
        return null;
    }

    /* ── handles ────────────────────────────────────────── */

    /** The four corner handles, in the element's own frame. */
    function handles(b) {
        return [
            { id: 'tl', x: b.x - PAD, y: b.y - PAD, cursor: 'nw-resize' },
            { id: 'tr', x: b.x + b.w + PAD, y: b.y - PAD, cursor: 'ne-resize' },
            { id: 'bl', x: b.x - PAD, y: b.y + b.h + PAD, cursor: 'sw-resize' },
            { id: 'br', x: b.x + b.w + PAD, y: b.y + b.h + PAD, cursor: 'se-resize' },
        ];
    }

    /** The rotation handle, in the element's own frame: above the top edge. */
    function rotationHandle(b) {
        return { x: b.x + b.w / 2, y: b.y - PAD - ROT_REACH };
    }

    /**
     * Which handle the point is on, or null. Rotation-aware: the point comes
     * into the element's frame first, so the handles rotate with the box the
     * way the chrome does.
     *
     * The rotation handle is checked first because it overlaps nothing but
     * sits close to the top two corners at small sizes, and grabbing rotate
     * when you meant resize is more recoverable than the reverse.
     */
    function hitTestHandle(x, y, el, b) {
        if (!el) return null;
        const p = toLocal(x, y, el, b);

        const rot = rotationHandle(b);
        const dx = p.x - rot.x;
        const dy = p.y - rot.y;
        if (Math.sqrt(dx * dx + dy * dy) <= ROT_RADIUS) {
            return { id: 'rotate', x: rot.x, y: rot.y, cursor: 'grab' };
        }

        for (const h of handles(b)) {
            if (p.x >= h.x - HANDLE && p.x <= h.x + HANDLE
                && p.y >= h.y - HANDLE && p.y <= h.y + HANDLE) return h;
        }
        return null;
    }

    /**
     * Where a rotation drag has got to.
     *
     * A DELTA FROM WHERE THE GRAB STARTED, not the cursor's absolute angle.
     * The original used the absolute angle plus 90, which looked correct only
     * because the rotation handle always sat directly above the unrotated
     * centre, making every grab start at the same place. Now that the handle
     * turns with the element, a grab starts at `origRotation` from vertical —
     * so an absolute angle would add that offset again and the element would
     * jump by its own rotation on the first mousemove.
     */
    function angleAt(x, y, center) {
        return Math.atan2(y - center.y, x - center.x) / DEG;
    }

    function rotateBy(origRotation, startAngle, angle) {
        const r = (origRotation + (angle - startAngle)) % 360;
        return r < 0 ? r + 360 : r;
    }

    /* ── resize ─────────────────────────────────────────── */

    /**
     * What a drag of `handle` by (dx, dy) does to the element.
     *
     * Returns a PATCH to apply, never a mutation, so the caller decides when
     * the change lands and can put it through undo. `orig` is the element's
     * bounds and font size captured at mousedown — deltas are measured from
     * there rather than accumulated, so a drag that wanders and comes back
     * ends where it started.
     *
     * Four behaviours, which is what the type means for a resize:
     *   line    the dragged END moves; the other stays put
     *   text    there is no box to stretch, so the FONT SIZE scales by the
     *           diagonal ratio and the glyphs re-measure
     *   image   aspect locked, because a stretched photo is never what was
     *           wanted and there is no way to say so afterwards
     *   else    a free box
     */
    function resize(el, handle, dx, dy, orig) {
        const ob = orig;

        if (el.type === 'line') {
            if (handle === 'tl') {
                const x = ob.x + dx;
                const y = ob.y + dy;
                return { x: x, y: y, w: (ob.x + ob.w) - x, h: (ob.y + ob.h) - y };
            }
            return { w: ob.w + dx, h: ob.h + dy };
        }

        if (el.type === 'text') {
            const origDiag = Math.sqrt(ob.w * ob.w + ob.h * ob.h);
            if (!(origDiag > 0)) return {};
            let nw, nh;
            if (handle === 'br') { nw = ob.w + dx; nh = ob.h + dy; }
            else if (handle === 'tl') { nw = ob.w - dx; nh = ob.h - dy; }
            else if (handle === 'tr') { nw = ob.w + dx; nh = ob.h - dy; }
            else { nw = ob.w - dx; nh = ob.h + dy; }
            const scale = Math.sqrt(nw * nw + nh * nh) / origDiag;
            return { fontSize: Math.max(MIN_FONT, Math.round((ob.fontSize || 48) * scale)) };
        }

        if (el.type === 'image' && el.aspectRatio) {
            const ar = el.aspectRatio;
            let w, h, x = ob.x, y = ob.y;
            if (handle === 'br') {
                w = Math.max(MIN_SIZE, ob.w + dx); h = w / ar;
            } else if (handle === 'tl') {
                w = Math.max(MIN_SIZE, ob.w - dx); h = w / ar;
                x = ob.x + ob.w - w; y = ob.y + ob.h - h;
            } else if (handle === 'tr') {
                w = Math.max(MIN_SIZE, ob.w + dx); h = w / ar;
                y = ob.y + ob.h - h;
            } else {
                w = Math.max(MIN_SIZE, ob.w - dx); h = w / ar;
                x = ob.x + ob.w - w;
            }
            return { x: x, y: y, w: w, h: h };
        }

        switch (handle) {
            case 'br':
                return { w: Math.max(MIN_SIZE, ob.w + dx), h: Math.max(MIN_SIZE, ob.h + dy) };
            case 'bl':
                return { x: ob.x + dx, w: Math.max(MIN_SIZE, ob.w - dx), h: Math.max(MIN_SIZE, ob.h + dy) };
            case 'tr':
                return { y: ob.y + dy, w: Math.max(MIN_SIZE, ob.w + dx), h: Math.max(MIN_SIZE, ob.h - dy) };
            case 'tl':
                return {
                    x: ob.x + dx, y: ob.y + dy,
                    w: Math.max(MIN_SIZE, ob.w - dx), h: Math.max(MIN_SIZE, ob.h - dy),
                };
            default:
                return {};
        }
    }

    /* ── fit ────────────────────────────────────────────── */

    /**
     * Place a source of some aspect into a box, centred, aspect kept.
     *
     *   'cover'    scale until the box is filled; the long side hangs off both
     *              edges and the canvas clips it. THAT IS THE CROP — there is
     *              no crop tool in this app and there does not need to be one.
     *   'contain'  scale until the whole source is visible; the short side
     *              leaves equal margins.
     *
     * A non-square source cannot fill a differently-shaped box without either
     * cropping or letterboxing, so the mode is the choice of which, rather
     * than a problem to be solved.
     *
     * Depends only on the ASPECT, never the absolute size, which is what makes
     * it idempotent: re-fitting an already-fitted rectangle returns the same
     * rectangle. The original had to re-base its scale slider by hand after
     * every fit because its fit and its scale were two numbers fighting; here
     * the fit IS the stored geometry, and ui/props.js re-bases origW/origH
     * from the patch.
     *
     * `box` rather than a square size: this is the shape deck-forge's
     * print geometry already speaks, so a CD wallet or a cassette J-card is
     * the same call with a different box.
     */
    function fit(el, mode, box) {
        const aspect = el.aspectRatio || (el.h ? el.w / el.h : 1);
        if (!(aspect > 0) || !isFinite(aspect)) {
            return { x: box.x, y: box.y, w: box.w, h: box.h };
        }
        const byWidth = box.w / aspect;
        const h = mode === 'contain' ? Math.min(byWidth, box.h) : Math.max(byWidth, box.h);
        const w = aspect * h;
        return {
            x: box.x + (box.w - w) / 2,
            y: box.y + (box.h - h) / 2,
            w: w,
            h: h,
        };
    }

    App.geometry = {
        PAD: PAD,
        HANDLE: HANDLE,
        ROT_REACH: ROT_REACH,
        ROT_RADIUS: ROT_RADIUS,
        bounds: bounds,
        centerOf: centerOf,
        toLocal: toLocal,
        toWorld: toWorld,
        envelope: envelope,
        inPaddedBox: inPaddedBox,
        hitTest: hitTest,
        handles: handles,
        rotationHandle: rotationHandle,
        hitTestHandle: hitTestHandle,
        angleAt: angleAt,
        rotateBy: rotateBy,
        resize: resize,
        fit: fit,
    };
}());
