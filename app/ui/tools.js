// ui/tools.js — the pointer state machine, and nothing else.
//
// Every piece of arithmetic this file used to do now lives in
// core/geometry.js: bounds, hit testing, handle placement, all four resize
// branches, the rotation delta. What is left is the part that genuinely
// cannot be tested without a mouse — which of six states a drag is in, and
// when a change is worth an undo entry.
//
// The web tool also reached into the DOM from in here (the text resize branch
// wrote document.getElementById('fontSize').value) and monkey-patched its own
// setTool from app.js to get a callback it already had. Neither is ported:
// geometry.resize returns a PATCH, and onToolChange is the only path.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const G = () => App.geometry;

    let tool = 'select';
    let clipartId = null;
    let toolClass = '';
    let cb = {};

    /* One state at a time. `pending` is the gap between mousedown on an
       element and actually moving it: below the threshold a drag is still a
       click, which is what lets a click select without nudging by a pixel. */
    let dragging = null;    // { el, startX, startY, origX, origY, pending }
    let drawing = null;     // { el, startX, startY }
    let resizing = null;    // { el, handle, startX, startY, orig }
    let rotating = null;    // { el, center, startAngle, origRotation }
    let moved = false;

    const DRAG_THRESHOLD = 4;

    /* HOW CLOSE COUNTS AS CENTRED, in SCREEN pixels rather than document
       ones. The backing store runs 512 to 4096 against an element about
       740px wide, so a fixed number of document units would be four times
       stickier on a 4096 cover than on a 1024 one — the same gesture
       snapping in one canvas size and not in another.

       Four is about half a corner handle: it catches the centre when that
       is what you are aiming for, and something deliberately placed five
       pixels off centre stays five pixels off centre. */
    const SNAP_SCREEN_PX = 4;

    function init(callbacks) { cb = callbacks || {}; }

    function setTool(next) {
        if (toolClass) document.body.classList.remove(toolClass);
        tool = next;
        toolClass = 'tool-' + next;
        document.body.classList.add(toolClass);
        // The ONLY path. The web tool wrapped this function from app.js to
        // also refresh the property panel, because some callers bypassed the
        // callback; now every caller goes through here.
        if (cb.onToolChange) cb.onToolChange(next);
    }

    function getTool() { return tool; }
    function setClipartId(id) { clipartId = id; }
    function getClipartId() { return clipartId; }

    function measure() { return App.canvas.measure; }

    function selected(doc) {
        const id = cb.selectedId ? cb.selectedId() : null;
        return id == null ? null : doc.elements.find((el) => el.id === id) || null;
    }

    /* ── down ───────────────────────────────────────────── */

    function onMouseDown(e, doc) {
        const p = App.canvas.toCanvas(e);
        moved = false;

        if (tool === 'select') {
            const sel = selected(doc);

            // A handle on the ALREADY-selected element wins over whatever is
            // under the cursor: the handles sit outside the box, often over
            // something else.
            //
            // NOT IF IT IS LOCKED. hitTest already refuses to select one, but
            // an element can be locked while it is selected, and the handles
            // answer to the selection rather than to a hit test. Without this
            // the corners of a locked photo stay draggable.
            if (sel && sel.locked !== true) {
                const b = G().bounds(sel, measure());
                const handle = G().hitTestHandle(p.x, p.y, sel, b);
                if (handle && handle.id === 'rotate') {
                    if (cb.onStrokeStart) cb.onStrokeStart();
                    const center = G().centerOf(b);
                    rotating = {
                        el: sel,
                        center: center,
                        startAngle: G().angleAt(p.x, p.y, center),
                        origRotation: sel.rotation || 0,
                    };
                    return;
                }
                if (handle) {
                    // Opened here, before the first mutation, and exactly
                    // once — not per mousemove.
                    if (cb.onStrokeStart) cb.onStrokeStart();
                    resizing = {
                        el: sel, handle: handle.id, startX: p.x, startY: p.y,
                        orig: Object.assign(G().bounds(sel, measure()),
                            { fontSize: sel.fontSize }),
                    };
                    return;
                }
            }

            const hit = G().hitTest(p.x, p.y, doc.elements, measure());
            if (hit) {
                if (cb.onSelect) cb.onSelect(hit.id);
                dragging = {
                    el: hit, startX: p.x, startY: p.y,
                    origX: hit.x, origY: hit.y, pending: true,
                };
            } else if (cb.onSelect) {
                cb.onSelect(null);
            }
            return;
        }

        if (tool === 'text') {
            if (cb.onTextPlace) cb.onTextPlace(p.x, p.y);
            return;
        }

        // Any other tool draws a new element by dragging a box out.
        const el = App.element.create(tool, Object.assign(
            { x: p.x, y: p.y, w: 0, h: 0 },
            cb.style ? cb.style() : {},
            tool === 'clipart' ? { clipartId: clipartId } : {}
        ));
        drawing = { el: el, startX: p.x, startY: p.y };
        if (cb.onDrawStart) cb.onDrawStart(el);
    }

    /* ── move ───────────────────────────────────────────── */

    function onMouseMove(e, doc) {
        const p = App.canvas.toCanvas(e);

        if (dragging) {
            const dx = p.x - dragging.startX;
            const dy = p.y - dragging.startY;
            if (dragging.pending) {
                if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
                dragging.pending = false;
                // The undo entry is opened when the drag becomes real, not on
                // mousedown, so a click that selects is not an undo step.
                if (cb.onStrokeStart) cb.onStrokeStart();
            }
            moved = true;
            dragging.el.x = dragging.origX + dx;
            dragging.el.y = dragging.origY + dy;

            /* Snap AFTER the raw move, so the offset is measured from where
               the element actually is rather than from where it started —
               otherwise a drag that crosses the centre accumulates the
               correction and drifts. */
            const snap = App.guides.snapToCentre(
                G().bounds(dragging.el, measure()),
                App.gatefold.canvasSize(doc.size),
                SNAP_SCREEN_PX * App.canvas.scale());
            dragging.el.x += snap.dx;
            dragging.el.y += snap.dy;
            if (cb.onGuides) cb.onGuides(snap.lines);

            if (cb.onChange) cb.onChange();
            return;
        }

        if (resizing) {
            moved = true;
            /* The canvas size is the ceiling on a text element’s font size.
               Without it a corner dragged past the edge scales the font
               without limit and the renderer dies rasterising it. */
            const patch = G().resize(resizing.el, resizing.handle,
                p.x - resizing.startX, p.y - resizing.startY, resizing.orig,
                App.gatefold.canvasSize(doc.size));
            Object.assign(resizing.el, patch);
            if (cb.onChange) cb.onChange();
            return;
        }

        if (rotating) {
            moved = true;
            rotating.el.rotation = G().rotateBy(
                rotating.origRotation,
                rotating.startAngle,
                G().angleAt(p.x, p.y, rotating.center)
            );
            if (cb.onChange) cb.onChange();
            return;
        }

        if (drawing) {
            moved = true;
            drawing.el.w = p.x - drawing.startX;
            drawing.el.h = p.y - drawing.startY;
            if (cb.onChange) cb.onChange();
            return;
        }

        // Not dragging: the cursor tells you what the handles would do.
        if (tool === 'select' && cb.onCursor) {
            const sel = selected(doc);
            if (!sel || sel.locked === true) { cb.onCursor(''); return; }
            const b = G().bounds(sel, measure());
            const handle = G().hitTestHandle(p.x, p.y, sel, b);
            cb.onCursor(handle ? handle.cursor : '');
        }
    }

    /* ── up ─────────────────────────────────────────────── */

    function onMouseUp() {
        if (drawing) {
            const el = drawing.el;
            drawing = null;
            /* A click with the rect tool is a click, not a zero-size element.
               Without this the canvas silently fills with invisible elements
               that the layers panel then lists. */
            if (!moved || (Math.abs(el.w) < 2 && Math.abs(el.h) < 2)) {
                if (cb.onDrawCancel) cb.onDrawCancel(el);
            } else {
                App.element.normalize(el);
                if (cb.onDrawCommit) cb.onDrawCommit(el);
            }
            moved = false;
            return;
        }

        const wasMoving = dragging || resizing || rotating;
        if (dragging && !dragging.pending && moved) App.element.normalize(dragging.el);
        if (resizing && moved) App.element.normalize(resizing.el);

        dragging = null;
        resizing = null;
        rotating = null;
        // The lines belong to the gesture, and the gesture is over.
        if (cb.onGuides) cb.onGuides([]);

        if (wasMoving && moved && cb.onStrokeEnd) cb.onStrokeEnd();
        moved = false;
    }

    function onDoubleClick(e, doc) {
        const p = App.canvas.toCanvas(e);
        const hit = G().hitTest(p.x, p.y, doc.elements, measure());
        if (hit && hit.type === 'text' && cb.onTextEdit) cb.onTextEdit(hit);
    }

    /** Abandon whatever is in progress — Escape, or a lost pointer capture. */
    function cancel() {
        if (drawing && cb.onDrawCancel) cb.onDrawCancel(drawing.el);
        dragging = resizing = rotating = drawing = null;
        moved = false;
        if (cb.onStrokeCancel) cb.onStrokeCancel();
    }

    function busy() { return !!(dragging || resizing || rotating || drawing); }

    App.tools = {
        init: init,
        setTool: setTool,
        getTool: getTool,
        setClipartId: setClipartId,
        getClipartId: getClipartId,
        onMouseDown: onMouseDown,
        onMouseMove: onMouseMove,
        onMouseUp: onMouseUp,
        onDoubleClick: onDoubleClick,
        cancel: cancel,
        busy: busy,
    };
}());
