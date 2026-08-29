import { test, eq, ok } from './kit/assert.mjs';

/* The library is data now — drawClipart moved to ui/render.js — so it can be
   checked without a canvas, which is the reason for the split. What matters
   here is that every icon is DRAWABLE: the renderer reads five optional
   collections and an icon carrying none of them is a silently empty element. */

export default function (M) {
    const C = M.clipart;

    const ids = C.getIconIds();

    test('the library is populated and every id resolves', () => {
        ok(ids.length >= 20, `${ids.length} icons`);
        for (const id of ids) ok(C.getIcon(id), `${id} resolves`);
        eq(C.getIcon('no-such-icon'), null, 'an unknown id is null, not undefined');
    });

    test('every icon has a label for the picker and the layer list', () => {
        for (const id of ids) {
            const label = C.getIconLabel(id);
            ok(typeof label === 'string' && label.length > 0, `${id} has a label`);
        }
    });

    test('an unknown id labels as itself rather than blank', () => {
        eq(C.getIconLabel('mystery'), 'mystery', 'better than an empty button');
    });

    /* An icon with no geometry draws nothing at all, which in a shapes popup
       is an invisible button that appears to do nothing when clicked. */
    test('every icon actually has something to draw', () => {
        for (const id of ids) {
            const icon = C.getIcon(id);
            const n = (icon.paths || []).length + (icon.circles || []).length
                + (icon.lines || []).length + (icon.rects || []).length
                + (icon.points || []).length;
            ok(n > 0, `${id} has at least one drawable`);
        }
    });

    test('every geometry entry has the arity the renderer unpacks', () => {
        for (const id of ids) {
            const icon = C.getIcon(id);
            for (const d of icon.paths || []) {
                ok(typeof d === 'string' && d.length > 0, `${id} path is a non-empty d string`);
            }
            for (const c of icon.circles || []) eq(c.length, 3, `${id} circle is [cx,cy,r]`);
            for (const l of icon.lines || []) eq(l.length, 4, `${id} line is [x1,y1,x2,y2]`);
            for (const r of icon.rects || []) {
                ok(r.length === 4 || r.length === 5, `${id} rect is [x,y,w,h] or [x,y,w,h,r]`);
            }
            for (const p of icon.points || []) eq(p.length, 2, `${id} point is [x,y]`);
        }
    });

    test('every coordinate is a finite number inside the 24x24 viewBox', () => {
        const inBox = (v) => Number.isFinite(v) && v >= -2 && v <= C.VIEWBOX + 2;
        for (const id of ids) {
            const icon = C.getIcon(id);
            for (const c of icon.circles || []) {
                ok(inBox(c[0]) && inBox(c[1]), `${id} circle centre in the box`);
                ok(c[2] > 0 && c[2] <= C.VIEWBOX, `${id} circle radius is positive and fits`);
            }
            for (const l of icon.lines || []) {
                for (const v of l) ok(inBox(v), `${id} line coordinate ${v}`);
            }
            for (const r of icon.rects || []) {
                for (const v of r) ok(Number.isFinite(v), `${id} rect value ${v}`);
                ok(r[2] > 0 && r[3] > 0, `${id} rect has a positive size`);
            }
            for (const p of icon.points || []) {
                ok(inBox(p[0]) && inBox(p[1]), `${id} point in the box`);
            }
        }
    });

    /* SVG path data is hand-typed, and a stray character in a `d` string does
       not throw — Path2D silently ignores what it cannot parse, so the icon
       just comes out wrong. Cheap to bound the alphabet. */
    test('path data contains only path syntax', () => {
        const ALLOWED = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\-+eE\s]+$/;
        for (const id of ids) {
            for (const d of C.getIcon(id).paths || []) {
                ok(ALLOWED.test(d), `${id} path is well-formed: ${d.slice(0, 40)}`);
            }
        }
    });

    test('ids are unique and usable as a data-value', () => {
        eq(new Set(ids).size, ids.length, 'no duplicates');
        for (const id of ids) ok(/^[a-z0-9-]+$/.test(id), `${id} is a safe attribute value`);
    });
}
