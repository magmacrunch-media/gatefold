// core/guides.js — alignment guides, and the snap that goes with them.
//
// One question today: is this element centred on the cover? The app could not
// answer it — the only feedback a selection gave was its W x H label, so a
// centred title was a thing you got to by eye and arrow keys and never quite
// knew you had.
//
// THE TOLERANCE IS NOT DECIDED HERE, and that is deliberate. The canvas
// backing store is 512 to 4096 while the element on screen is around 740px
// wide, so a distance measured in canvas units is four times stickier on a
// 4096 cover than on a 1024 one — the same gesture would snap in one and not
// the other. ui/tools.js converts a screen-pixel constant through
// canvas.scale() and passes the result in. A pure module cannot know what a
// pixel looks like.
//
// Each axis is independent: a box can pull into the horizontal centre while
// staying exactly where it was put vertically, which is the common case for a
// title that sits high on a cover.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /**
     * Snap a moving element's bounds to the centre of an arbitrary box.
     *
     * The general case snapToCentre was always a special case of. A J-card
     * wants a title centred on the FRONT PANEL rather than on the whole
     * strip, and that is this same arithmetic against a box that does not
     * start at the origin. core/panels.js picks the box; this does the sums,
     * so there is one centre-snap in the codebase rather than two.
     *
     * @param b          the element's bounds, as core/geometry.js returns them
     * @param box        {x, y, w, h} in document units
     * @param tolerance  how close, in document units, counts as aligned
     * @returns {{dx: number, dy: number, lines: Array<{axis: string, at: number}>}}
     *          the offset to add to the element's position, and the lines to
     *          draw. Nothing near: dx and dy are 0 and lines is empty.
     *
     * ROTATION NEEDS NOTHING EXTRA. bounds() is the element's box in its own
     * unrotated frame, and render.js turns the element about the centre of
     * exactly that box — so putting the bounds centre on the box centre
     * centres the rotated element too, at any angle.
     */
    function snapToBox(b, box, tolerance) {
        const out = { dx: 0, dy: 0, lines: [] };
        if (!b || !box || !(box.w > 0) || !(box.h > 0) || !(tolerance > 0)) return out;

        const centreX = box.x + box.w / 2;
        const cx = b.x + b.w / 2;
        if (Math.abs(cx - centreX) <= tolerance) {
            out.dx = centreX - cx;
            out.lines.push({ axis: 'x', at: centreX });
        }

        const centreY = box.y + box.h / 2;
        const cy = b.y + b.h / 2;
        if (Math.abs(cy - centreY) <= tolerance) {
            out.dy = centreY - cy;
            out.lines.push({ axis: 'y', at: centreY });
        }

        return out;
    }

    /**
     * Snap to the centre of a square canvas.
     *
     * The whole of what a square cover needs, and still the shape ui/tools.js
     * reaches for through core/panels.js when a document has no panels. The
     * canvasPx guard is not redundant with snapToBox's: it is what keeps a
     * zero size returning nothing rather than being handed on as a
     * zero-width box.
     */
    function snapToCentre(b, canvasPx, tolerance) {
        if (!(canvasPx > 0)) return { dx: 0, dy: 0, lines: [] };
        return snapToBox(b, { x: 0, y: 0, w: canvasPx, h: canvasPx }, tolerance);
    }

    App.guides = {
        snapToBox: snapToBox,
        snapToCentre: snapToCentre,
    };
}());
