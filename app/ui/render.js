// ui/render.js — everything that puts marks on a canvas.
//
// EVERY DRAW FUNCTION TAKES ITS CONTEXT AS ITS FIRST ARGUMENT. The web tool
// held one `ctx` at module scope and, to draw into an offscreen canvas for
// export, swapped it inside a try/finally:
//
//     function drawElementTo(targetCtx, el) {
//         const savedCtx = ctx; ctx = targetCtx;
//         try { drawElement(el); } finally { ctx = savedCtx; }
//     }
//
// Passing the context deletes that, and it deletes the other half of the same
// problem too: exportPNG used to null the module-level selectedId, render, and
// put it back, because the selection chrome was drawn into the same canvas as
// the artwork. Now the chrome is an option, so an export is one call —
// render(offscreenCtx, doc, { selectedId: null }) — and there is no state to
// restore if it throws.
//
// Geometry lives in core/geometry.js and waveforms in core/waves.js; this file
// only knows how to stroke and fill what they describe.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const CHROME = '#a0a0b0';
    const CHROME_FONT = '14px "Courier Prime"';

    /* ── paint helpers ──────────────────────────────────── */

    function hasFill(el) { return el.fill && el.fill !== 'none'; }
    function hasStroke(el) { return el.stroke && el.stroke !== 'none' && el.strokeWidth > 0; }

    function fillOrStroke(ctx, el) {
        if (hasFill(el)) { ctx.fillStyle = el.fill; ctx.fill(); }
        if (hasStroke(el)) {
            ctx.strokeStyle = el.stroke;
            ctx.lineWidth = el.strokeWidth;
            ctx.stroke();
        }
    }

    /* ── basic shapes ───────────────────────────────────── */

    function drawRect(ctx, el) {
        if (hasFill(el)) { ctx.fillStyle = el.fill; ctx.fillRect(el.x, el.y, el.w, el.h); }
        if (hasStroke(el)) {
            ctx.strokeStyle = el.stroke;
            ctx.lineWidth = el.strokeWidth;
            ctx.strokeRect(el.x, el.y, el.w, el.h);
        }
    }

    function drawCircle(ctx, el) {
        ctx.beginPath();
        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2,
            Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
        fillOrStroke(ctx, el);
    }

    function drawLine(ctx, el) {
        if (!hasStroke(el)) return;
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth || 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.stroke();
    }

    function drawTriangle(ctx, el) {
        ctx.beginPath();
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x, el.y + el.h);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.closePath();
        fillOrStroke(ctx, el);
    }

    function drawPolygon(ctx, el, sides, startAngle) {
        const cx = el.x + el.w / 2;
        const cy = el.y + el.h / 2;
        const rx = el.w / 2;
        const ry = el.h / 2;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = startAngle + (i * 2 * Math.PI) / sides;
            const px = cx + rx * Math.cos(a);
            const py = cy + ry * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        fillOrStroke(ctx, el);
    }

    function drawDiamond(ctx, el) {
        const cx = el.x + el.w / 2;
        const cy = el.y + el.h / 2;
        ctx.beginPath();
        ctx.moveTo(cx, el.y);
        ctx.lineTo(el.x + el.w, cy);
        ctx.lineTo(cx, el.y + el.h);
        ctx.lineTo(el.x, cy);
        ctx.closePath();
        fillOrStroke(ctx, el);
    }

    function drawStar(ctx, el) {
        const cx = el.x + el.w / 2;
        const cy = el.y + el.h / 2;
        const rx = el.w / 2;
        const ry = el.h / 2;
        const inner = 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const r = i % 2 === 0 ? 1 : inner;
            const px = cx + rx * r * Math.cos(a);
            const py = cy + ry * r * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        fillOrStroke(ctx, el);
    }

    function drawArrow(ctx, el) {
        if (!hasStroke(el)) return;
        const x1 = el.x;
        const y1 = el.y + el.h / 2;
        const x2 = el.x + el.w;
        const y2 = el.y + el.h / 2;
        const headLen = Math.min(el.w * 0.25, el.h * 0.4);
        const a = Math.atan2(y2 - y1, x2 - x1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(a - Math.PI / 6), y2 - headLen * Math.sin(a - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(a + Math.PI / 6), y2 - headLen * Math.sin(a + Math.PI / 6));
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function drawRoundRect(ctx, el) {
        const r = Math.min(el.w, el.h) * 0.15;
        ctx.beginPath();
        ctx.moveTo(el.x + r, el.y);
        ctx.lineTo(el.x + el.w - r, el.y);
        ctx.arcTo(el.x + el.w, el.y, el.x + el.w, el.y + r, r);
        ctx.lineTo(el.x + el.w, el.y + el.h - r);
        ctx.arcTo(el.x + el.w, el.y + el.h, el.x + el.w - r, el.y + el.h, r);
        ctx.lineTo(el.x + r, el.y + el.h);
        ctx.arcTo(el.x, el.y + el.h, el.x, el.y + el.h - r, r);
        ctx.lineTo(el.x, el.y + r);
        ctx.arcTo(el.x, el.y, el.x + r, el.y, r);
        ctx.closePath();
        fillOrStroke(ctx, el);
    }

    /* ── waves ──────────────────────────────────────────── */

    /**
     * A wave is a sampled path. core/waves.js decides the points; this decides
     * whether the path is closed down to the bottom of the box and filled, or
     * left open and stroked.
     */
    function drawWave(ctx, el) {
        const points = App.waves.samplePath(el);
        if (!points.length) return;
        const isOpen = el.waveMode === 'open';

        ctx.beginPath();
        if (isOpen) ctx.moveTo(points[0][0], points[0][1]);
        else ctx.moveTo(el.x, el.y + el.h);

        for (const [px, py] of points) ctx.lineTo(px, py);

        if (!isOpen) {
            ctx.lineTo(el.x + el.w, el.y + el.h);
            ctx.closePath();
        }
        fillOrStroke(ctx, el);
    }

    /* ── text, image, clip art ──────────────────────────── */

    function drawText(ctx, el) {
        if (!el.text) return;
        const fontSize = el.fontSize || 48;
        const font = el.font || 'Press Start 2P';
        ctx.font = `${fontSize}px "${font}"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = String(el.text).split('\n');
        const lineHeight = fontSize * 1.3;

        for (let i = 0; i < lines.length; i++) {
            const ly = el.y + i * lineHeight;
            if (hasFill(el)) { ctx.fillStyle = el.fill; ctx.fillText(lines[i], el.x, ly); }
            if (hasStroke(el)) {
                ctx.strokeStyle = el.stroke;
                ctx.lineWidth = el.strokeWidth;
                ctx.lineJoin = 'round';
                ctx.strokeText(lines[i], el.x, ly);
            }
        }
    }

    /**
     * An image element draws whatever ui/images.js has decoded for its ref.
     *
     * A ref with no decoded bitmap yet draws NOTHING and does not throw. The
     * redraw when it arrives is ui/images.js's job, not this file's — a
     * renderer that scheduled its own repaints would be a second render loop.
     */
    function drawImage(ctx, el) {
        const img = App.images && App.images.bitmap(el.src);
        if (!img || !img.complete || !img.naturalWidth) return;
        ctx.drawImage(img, el.x, el.y, el.w, el.h);
    }

    /* Moved here from core/clipart.js, which is now data only. The icon is
       defined in a 24x24 viewBox and is scaled to fit the element's shorter
       side and centred, so a clip art element keeps its proportions however
       the box is dragged. */
    function drawClipart(ctx, el) {
        const icon = App.clipart.getIcon(el.clipartId);
        if (!icon) return;

        const color = hasStroke(el) ? el.stroke : (el.fill || '#ffffff');
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = el.strokeWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const box = App.clipart.VIEWBOX;
        const scale = Math.min(el.w, el.h) / box;

        ctx.save();
        ctx.translate(el.x + (el.w - box * scale) / 2, el.y + (el.h - box * scale) / 2);
        ctx.scale(scale, scale);

        for (const d of icon.paths || []) ctx.stroke(new Path2D(d));

        for (const [cx, cy, r] of icon.circles || []) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (const [x1, y1, x2, y2] of icon.lines || []) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        for (const [rx, ry, rw, rh, rr] of icon.rects || []) {
            ctx.beginPath();
            if (rr) ctx.roundRect(rx, ry, rw, rh, rr); else ctx.rect(rx, ry, rw, rh);
            ctx.stroke();
        }
        for (const [px, py] of icon.points || []) {
            ctx.beginPath();
            ctx.arc(px, py, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ── the dispatch ───────────────────────────────────── */

    const DRAW = {
        rect: drawRect,
        circle: drawCircle,
        line: drawLine,
        text: drawText,
        image: drawImage,
        clipart: drawClipart,
        triangle: drawTriangle,
        pentagon: (ctx, el) => drawPolygon(ctx, el, 5, -Math.PI / 2),
        hexagon: (ctx, el) => drawPolygon(ctx, el, 6, -Math.PI / 2),
        diamond: drawDiamond,
        star: drawStar,
        arrow: drawArrow,
        roundrect: drawRoundRect,
    };
    for (const t of App.waves.TYPES) DRAW[t] = drawWave;

    /** The rotation the chrome must agree with. Same centre, same sign. */
    function applyRotation(ctx, el, b) {
        if (!el.rotation) return;
        const c = App.geometry.centerOf(b);
        ctx.translate(c.x, c.y);
        ctx.rotate(el.rotation * Math.PI / 180);
        ctx.translate(-c.x, -c.y);
    }

    function drawElement(ctx, el, measure) {
        const fn = DRAW[el.type];
        if (!fn || el.visible === false) return;
        ctx.save();
        if (el.opacity != null && el.opacity < 100) ctx.globalAlpha = el.opacity / 100;
        applyRotation(ctx, el, App.geometry.bounds(el, measure));
        fn(ctx, el);
        ctx.restore();
    }

    /* ── the selection chrome ───────────────────────────── */

    /**
     * The dashed box, four corner handles and rotation handle.
     *
     * DRAWN INSIDE THE ROTATION, which the web tool's version was not — its
     * chrome stayed axis-aligned while the element turned under it, so at any
     * rotation the box did not wrap what it was selecting. The handles are in
     * the element's own frame (core/geometry.js), the same frame hit testing
     * puts the cursor into, so what you can see is what you can grab.
     *
     * The W x H LABEL IS THE EXCEPTION and stays unrotated: text at 170
     * degrees is unreadable. It is positioned against the ENVELOPE — the
     * axis-aligned box containing the turned one — so it clears the element
     * instead of landing on top of it.
     */
    function drawSelection(ctx, el, measure) {
        const b = App.geometry.bounds(el, measure);
        const pad = App.geometry.PAD;

        ctx.save();
        applyRotation(ctx, el, b);

        ctx.strokeStyle = CHROME;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);

        ctx.setLineDash([]);
        ctx.fillStyle = CHROME;
        const hs = 10;
        for (const h of App.geometry.handles(b)) {
            ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        }

        const rot = App.geometry.rotationHandle(b);
        ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, b.y - pad);
        ctx.lineTo(rot.x, rot.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rot.x, rot.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Unrotated, and placed against the envelope so it clears the element.
        const e = App.geometry.envelope(b, el.rotation || 0);
        ctx.save();
        ctx.fillStyle = CHROME;
        ctx.font = CHROME_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const label = el.type === 'line'
            ? `${Math.round(Math.sqrt(b.w * b.w + b.h * b.h))} px`
            : `${Math.round(b.w)} × ${Math.round(b.h)}`;
        ctx.fillText(label, e.x + e.w / 2, e.y + e.h + pad + 16);
        ctx.restore();
    }

    /* ── the frame ──────────────────────────────────────── */

    /**
     * Draw the whole document into `ctx`.
     *
     * opts.selectedId  draw the chrome around this element; null or absent
     *                  means none, which is what an export passes.
     * opts.preview     one element drawn last and owned by nobody — the text
     *                  being typed in the ADD TEXT dialog, before it exists.
     *                  It is NOT in doc.elements on purpose: an element in
     *                  the document is counted by the stats, listed by the
     *                  layers panel and reachable by undo, and a preview that
     *                  might still be cancelled is none of those things.
     * opts.measure     the text measurer (see core/geometry.js).
     * opts.width/height  the surface, in document units.
     */
    function render(ctx, doc, opts) {
        const o = opts || {};
        const w = o.width || App.gatefold.canvasSize(doc.size);
        const h = o.height || w;

        ctx.save();
        ctx.fillStyle = doc.bgColor || '#ffffff';
        ctx.fillRect(0, 0, w, h);

        for (const el of doc.elements) drawElement(ctx, el, o.measure);

        // Last, so it reads as being on top of the artwork it will join.
        if (o.preview) drawElement(ctx, o.preview, o.measure);

        if (o.selectedId != null) {
            const sel = doc.elements.find((el) => el.id === o.selectedId);
            if (sel && sel.visible !== false) drawSelection(ctx, sel, o.measure);
        }
        ctx.restore();
    }

    App.render = {
        render: render,
        drawElement: drawElement,
        drawSelection: drawSelection,
        applyRotation: applyRotation,
        DRAW: DRAW,
    };
}());
