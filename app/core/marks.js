// core/marks.js — crop and fold marks, and the sheet that has room for them.
//
// THE MARKS CANNOT GO IN THE BLEED, which is the whole reason this file exists
// rather than being three more lines in core/panels.js. The bleed is artwork
// that gets cut off; a mark drawn there would sit on top of the photograph AND
// be thrown away by the same knife it was meant to guide. Printer's marks live
// OUTSIDE the bleed, on paper that is never part of the finished card.
//
// So a marked export is a bigger image than an unmarked one — surface plus a
// margin on all four sides — and that is why marks are opt-in rather than
// always on. ui/export.js has produced exactly m.surface for every print
// document so far, and silently handing back a different number of pixels
// would break anyone who had measured it.
//
// EVERYTHING IS IN UNITS OF THE BLEED. A format that declares an eighth of an
// inch of bleed gets an eighth-inch offset, an eighth-inch mark and a
// sixteenth-inch slug, and one that declares three millimetres gets marks in
// proportion — without this file holding a second table of print dimensions
// beside the one in core/formats.js.
//
// Takes a METRICS object, never a size, for the same reason core/panels.js
// does: the millimetre question is answered before anything here runs.
//
// Pure: no DOM, no ctx. ui/render.js draws what this describes.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const NEAR = 1e-6;

    /* All three as multiples of the bleed.

       OFFSET is the gap between the cut and the near end of the mark. It is
       exactly the bleed because that is precisely the strip of artwork that
       gets trimmed away: a mark starting any closer would be printed over
       image, and one starting further out would stop indicating the cut.

       SLUG is unprinted paper between the far end of the mark and the edge of
       the sheet. A mark running right off the edge is legal and common in a
       real imposition, but this is a PNG somebody will look at before they
       print it, and a hairline flush against the boundary reads as a cropping
       accident. */
    const OFFSET = 1;
    const LENGTH = 1;
    const SLUG = 0.5;

    /**
     * Is there anywhere to put marks?
     *
     * A bleed is the test, not panels: a bleed is what makes a document
     * something that gets CUT, and a cut is what a crop mark is about. The
     * four square pixel sizes have no bleed and no physical size, so they
     * have no cut to mark and no margin to mark it in.
     */
    function wanted(m) {
        return !!(m && m.bleed > 0 && m.surface);
    }

    /**
     * How much paper to add on each side.
     *
     * ROUNDED, AND THAT MATTERS MORE THAN IT LOOKS. This is where ui/export.js
     * draws the composed artwork into the larger sheet, and drawImage at a
     * fractional offset resamples every pixel it copies — a 300dpi card would
     * arrive at the printer very slightly soft, for no reason anybody could
     * see on screen. An integer offset is a straight copy.
     */
    function margin(m) {
        return Math.round((LENGTH + SLUG) * m.bleed);
    }

    /** How thick a mark is drawn, scaled so it stays hairline-thin at any dpi. */
    function weight(m) {
        return Math.max(1, Math.round(m.surface.w / 600));
    }

    /**
     * The sheet the marked export is drawn on.
     *
     * `offset` is where the surface's top-left lands on it — the surface, not
     * the trim, so the bleed is carried through untouched and the marks are
     * added around the file that would otherwise have been written.
     */
    function sheet(m) {
        if (!wanted(m)) return null;
        const g = margin(m);
        return {
            w: m.surface.w + g * 2,
            h: m.surface.h + g * 2,
            offset: { x: g, y: g },
            margin: g,
        };
    }

    /**
     * Every mark, as a segment in SHEET coordinates.
     *
     * Two kinds, and they are not the same instruction: a crop mark says cut
     * here and a fold mark says bend here. Marks are aligned to the TRIM,
     * which is the only line a knife or a folder cares about — never to the
     * surface, whose edges are the rounded outside of the bleed.
     */
    function lines(m) {
        if (!wanted(m)) return [];

        const g = margin(m);
        const b = m.bleed;
        const len = LENGTH * b;
        const off = OFFSET * b;

        // The trim box, in sheet coordinates.
        const left = g + m.origin.x;
        const top = g + m.origin.y;
        const right = left + m.trim.w;
        const bottom = top + m.trim.h;

        const out = [];
        const mark = (kind, ax, ay, bx, by) =>
            out.push({ kind: kind, x1: ax, y1: ay, x2: bx, y2: by });

        /* Two per corner: one on each of the cuts that meet there. Eight in
           all, and the pair is what makes a corner findable — a single mark
           locates a line, not a point. */
        for (const y of [top, bottom]) {
            mark('crop', left - off - len, y, left - off, y);
            mark('crop', right + off, y, right + off + len, y);
        }
        for (const x of [left, right]) {
            mark('crop', x, top - off - len, x, top - off);
            mark('crop', x, bottom + off, x, bottom + off + len);
        }

        /* A tick on both sides of every internal fold, so the card can be
           lined up from either edge. ZERO IS A CUT, NOT A FOLD — the same rule
           core/panels.js draws its overlay by, and for the same reason: the
           first panel's leading edge is already marked, in the other kind. */
        const along = m.panelAxis === 'x' ? 'x' : 'y';
        for (const p of m.panels || []) {
            if (!(p.at > NEAR)) continue;
            if (along === 'y') {
                const y = top + p.at;
                mark('fold', left - off - len, y, left - off, y);
                mark('fold', right + off, y, right + off + len, y);
            } else {
                const x = left + p.at;
                mark('fold', x, top - off - len, x, top - off);
                mark('fold', x, bottom + off, x, bottom + off + len);
            }
        }

        return out;
    }

    App.marks = {
        OFFSET: OFFSET,
        LENGTH: LENGTH,
        SLUG: SLUG,
        wanted: wanted,
        margin: margin,
        weight: weight,
        sheet: sheet,
        lines: lines,
    };
}());
