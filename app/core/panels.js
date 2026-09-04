// core/panels.js — a print format's panels, as regions on the artboard.
//
// PANELS ARE METADATA, NOT OWNERS. The document is still ONE flat artboard
// with ONE elements list; a panel is a { name, len } on doc.size and a set of
// lines to draw. Art may cross a fold on purpose — that is what a wraparound
// spine IS, and a model where each panel owned its own elements could not
// express it. core/geometry.js, ui/session.js's undo, ui/layers.js and every
// hit test never learn this file exists, which is why print formats are not a
// rewrite of any of them.
//
// This is a second file rather than more of core/guides.js because the two
// have different LIFETIMES and different SHAPES. A guide is per-gesture,
// recomputed on every mousemove; folds and safe margins are a property of the
// document, settled the moment its size is. And guides.js's entire contract is
// (bounds, box, tolerance) -> {dx, dy, lines}, where this needs a region
// model: which box a point is in, what a box's bleed-extended version is,
// where the folds are. They share the {axis, at} line shape, so ui/render.js
// draws both with one primitive, and snapIn is implemented BY CALLING
// guides.snapToBox.
//
// Takes a METRICS object (core/formats.js), never a size, so the millimetre
// question is already answered before anything here runs.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const NEAR = 1e-6;

    /**
     * Every panel as a box, origin at the trim's top-left.
     *
     * A DOCUMENT WITH NO PANELS IS ONE BOX: THE TRIM. That is what makes
     * every function below correct for a square cover without a branch, and
     * what lets ui/props.js and ui/import.js call the panel path
     * unconditionally and get exactly their old behaviour back.
     */
    function boxes(m) {
        if (!m) return [];
        if (!m.panels || !m.panels.length) {
            return [{ name: 'PAGE', x: 0, y: 0, w: m.trim.w, h: m.trim.h }];
        }
        return m.panels.map(function (p) {
            return m.panelAxis === 'y'
                ? { name: p.name, x: 0, y: p.at, w: m.trim.w, h: p.len }
                : { name: p.name, x: p.at, y: 0, w: p.len, h: m.trim.h };
        });
    }

    /** The panel a point is in, or null. The bleed is outside every panel. */
    function at(m, x, y) {
        for (const b of boxes(m)) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
        }
        return null;
    }

    /** The one a new element belongs on: the front. */
    function primary(m) {
        return boxes(m)[0] || null;
    }

    /**
     * A box grown to the bleed on whichever of its edges IS a trim edge.
     *
     * Cover-fitting a photo to the trim leaves a white sliver when the cut
     * drifts, which it always does — that is the whole reason bleed exists.
     * An INNER edge is a fold, not a cut, so it is left exactly where it is:
     * running the front panel's photo past the fold puts it on the spine.
     */
    function bleedBox(m, box) {
        if (!m || !box) return box || null;
        const b = m.bleed || 0;
        const left = box.x <= NEAR ? b : 0;
        const top = box.y <= NEAR ? b : 0;
        const right = box.x + box.w >= m.trim.w - NEAR ? b : 0;
        const bottom = box.y + box.h >= m.trim.h - NEAR ? b : 0;
        return {
            name: box.name,
            x: box.x - left,
            y: box.y - top,
            w: box.w + left + right,
            h: box.h + top + bottom,
        };
    }

    /**
     * Centre-snap WITHIN the panel the element is on.
     *
     * A title centred on the front panel, not on the whole strip — whose
     * centre on a J-card is a point inside the spine, where nothing anybody
     * wants is. The panel is chosen by the element's OWN centre, so dragging
     * from the front to the back hands off as you cross the fold rather than
     * pulling back to where the drag started.
     *
     * A document with no panels resolves to the trim box, which is precisely
     * what guides.snapToCentre already did, so a square cover is unaffected.
     */
    function snapIn(b, m, tolerance) {
        const empty = { dx: 0, dy: 0, lines: [] };
        if (!b || !m || !(tolerance > 0)) return empty;
        const box = at(m, b.x + b.w / 2, b.y + b.h / 2) || primary(m);
        if (!box) return empty;
        return App.guides.snapToBox(b, box, tolerance);
    }

    /**
     * The non-printing overlay: the trim box, the folds, the safe margin,
     * and what each panel is called.
     *
     * Four kinds because they mean four different things — a fold is where
     * the card BENDS, a safe line is where a title stops being safe, the
     * trim is where the knife goes, and a label is which panel you are
     * looking at.
     *
     * NOT ALL OF THEM ARE LINES, and that was already true before the labels:
     * `trim` is a rectangle and carries no axis. The list is overlay ITEMS
     * discriminated by `kind`, which is why ui/render.js switches on it
     * rather than walking one shape.
     *
     * FOLDS ARE THE INTERNAL BOUNDARIES ONLY. Zero and the far edge are cuts,
     * not folds, and they are already the trim. The safe margin is inset from
     * every cut AND every fold, because an eighth of an inch of a title
     * disappearing into a bend is the same lost title as an eighth
     * disappearing into the knife.
     */
    function lines(m) {
        if (!m) return [];
        const out = [{ kind: 'trim' }];

        const along = m.panelAxis === 'x' ? 'x' : 'y';
        const cross = along === 'x' ? 'y' : 'x';
        const crossLen = cross === 'x' ? m.trim.w : m.trim.h;

        const safe = m.safe || 0;
        if (safe > 0) {
            out.push({ kind: 'safe', axis: cross, at: safe });
            out.push({ kind: 'safe', axis: cross, at: crossLen - safe });
        }

        /* A DOCUMENT WITH NO PANELS IS NOT LABELLED. boxes() answers with one
           box called PAGE so that every function in this file works on a
           square cover without a branch — but drawing the word PAGE across a
           square album cover is noise about a distinction it does not have. */
        const named = !!(m.panels && m.panels.length);

        for (const box of boxes(m)) {
            const lo = along === 'x' ? box.x : box.y;
            const len = along === 'x' ? box.w : box.h;
            if (lo > NEAR) out.push({ kind: 'fold', axis: along, at: lo });
            if (safe > 0) {
                out.push({ kind: 'safe', axis: along, at: lo + safe });
                out.push({ kind: 'safe', axis: along, at: lo + len - safe });
            }
            /* THE NAME GOES IN THE MARGIN, not in the panel. Centred in the
               band between the panel's leading edge and its safe line — the
               strip a printer's template already reserves, and the one part
               of a panel nothing worth covering is allowed to occupy.

               Worth having because a J-card is otherwise unreadable as a
               layout: a JP5 is eight stacked rectangles of which five are
               flaps differing by a sixteenth of an inch, and nothing on
               screen says which of them folds where. A point, not a line —
               ui/render.js anchors the text at it. */
            if (named) {
                out.push({
                    kind: 'label',
                    name: box.name,
                    x: along === 'x' ? lo + safe : safe,
                    y: along === 'x' ? safe / 2 : lo + safe / 2,
                });
            }
        }
        return out;
    }

    App.panels = {
        boxes: boxes,
        at: at,
        primary: primary,
        bleedBox: bleedBox,
        snapIn: snapIn,
        lines: lines,
    };
}());
