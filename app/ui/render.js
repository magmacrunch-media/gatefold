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
    /* The rose accent, not the chrome grey: a guide is a statement about
       the canvas rather than a part of the selection, and the two must not
       be mistaken for each other while both are on screen. */
    const GUIDE = '#ff3d6e';
    const CHROME_FONT = '14px "Courier Prime"';

    /* THREE WEIGHTS, BECAUSE THEY MEAN THREE DIFFERENT THINGS. A fold is
       where the card BENDS, a safe line is where a title stops being safe,
       and the trim is where the knife goes. Drawing them alike would say the
       card can be cut at a fold, which is the one mistake this overlay exists
       to prevent. All three are non-printing: only ui/session.js asks for
       them, and ui/export.js does not. */
    const FOLD = GUIDE;
    const SAFE = 'rgba(255, 61, 110, 0.45)';
    const TRIM = 'rgba(160, 160, 176, 0.7)';

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

    /* ── the guides ─────────────────────────────────────── */

    /* A hairline scaled to the canvas, not fixed at 1: at 4096 a one-unit
       line is a quarter of a screen pixel and effectively invisible, which is
       the size at which a guide is most wanted. Off the TRIM rather than the
       surface, so a document's bleed does not change how thick its guides
       look. */
    function hairline(m) { return Math.max(1, Math.round(m.trim.w / 512)); }

    /* Edge to edge means edge of the SURFACE — a centre line that stopped at
       the trim would leave the bleed looking like somewhere the guide does
       not apply. Coordinates are post-translate, so the surface runs from
       -bleed to trim + bleed. */
    function spanLine(ctx, g, m) {
        const b = m.bleed || 0;
        if (g.axis === 'x') {
            ctx.moveTo(g.at, -b);
            ctx.lineTo(g.at, m.trim.h + b);
        } else {
            ctx.moveTo(-b, g.at);
            ctx.lineTo(m.trim.w + b, g.at);
        }
    }

    /** The drag's alignment lines. Over everything, including the chrome. */
    function drawGuides(ctx, guides, m) {
        ctx.save();
        ctx.strokeStyle = GUIDE;
        ctx.lineWidth = hairline(m);
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const g of guides) spanLine(ctx, g, m);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * How big a panel name is drawn.
     *
     * Scaled to the BAND it sits in rather than to the canvas, so the label
     * cannot outgrow the space holding it: at 300dpi an eighth of an inch of
     * safe margin is 37.5 dots and the name comes out 28. The chrome's own
     * fixed 14px would be a fifth of that band on one document and illegible
     * on another. Floored, because a format with no safe margin still has to
     * put a readable number somewhere.
     */
    function labelSize(m) {
        const band = m.safe || 0;
        return Math.max(9, Math.round(band > 0 ? band * 0.75 : m.trim.w / 48));
    }

    /**
     * The print overlay: the trim box, the folds, the safe margin, and the
     * name of each panel.
     *
     * Under the selection chrome rather than over it, unlike the drag guides
     * — these are always on while a print format is open, and a permanent
     * overlay that draws on top of the handles is a permanent obstruction.
     */
    function drawPanelLines(ctx, lines, m) {
        const lw = hairline(m);
        ctx.save();

        ctx.strokeStyle = TRIM;
        ctx.lineWidth = lw;
        ctx.setLineDash([]);
        ctx.strokeRect(0, 0, m.trim.w, m.trim.h);

        ctx.strokeStyle = FOLD;
        ctx.beginPath();
        for (const l of lines) if (l.kind === 'fold') spanLine(ctx, l, m);
        ctx.stroke();

        /* Dashed, and the dash is scaled too — a fixed 6px pattern on a 4096
           canvas reads as a solid line. */
        ctx.strokeStyle = SAFE;
        ctx.setLineDash([lw * 8, lw * 8]);
        ctx.beginPath();
        for (const l of lines) if (l.kind === 'safe') spanLine(ctx, l, m);
        ctx.stroke();

        /* The names last, so they read over the lines that bound them rather
           than under. The dash has to be cleared first — it applies to text
           drawn as a stroke, and leaving it set is the kind of state leak
           this file passes its context around to avoid. */
        ctx.setLineDash([]);
        ctx.fillStyle = FOLD;
        ctx.font = `${labelSize(m)}px "Courier Prime"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const l of lines) if (l.kind === 'label') ctx.fillText(l.name, l.x, l.y);

        ctx.restore();
    }

    /* ── the frame ──────────────────────────────────────── */

    /**
     * Draw the whole document into `ctx`.
     *
     * opts.selectedId  draw the chrome around this element; null or absent
     *                  means none, which is what an export passes.
     * opts.guides      alignment lines to draw over everything: [{axis, at}].
     *                  Present only during a drag, and never during an export.
     * opts.preview     one element drawn last and owned by nobody — the text
     *                  being typed in the ADD TEXT dialog, before it exists.
     *                  It is NOT in doc.elements on purpose: an element in
     *                  the document is counted by the stats, listed by the
     *                  layers panel and reachable by undo, and a preview that
     *                  might still be cancelled is none of those things.
     * opts.panels      the fold, safe and trim lines to draw over the
     *                  artwork: core/panels.js's lines(). Present only when
     *                  the editor asks for them, and NEVER on an export —
     *                  the same mechanism that keeps the guides and the
     *                  selection chrome out of the file.
     * opts.measure     the text measurer (see core/geometry.js).
     * opts.metrics     core/formats.js's metrics() for this document, passed
     *                  in when the caller already has it.
     * opts.width/height  the SURFACE, in document units — trim plus bleed.
     */
    function render(ctx, doc, opts) {
        const o = opts || {};
        const m = o.metrics || App.formats.metrics(doc.size);
        const w = o.width || m.surface.w;
        const h = o.height || m.surface.h;

        ctx.save();
        /* The background fills the WHOLE SURFACE, bleed included. That is what
           bleed is for: the colour has to run past where the knife lands. */
        ctx.fillStyle = doc.bgColor || '#ffffff';
        ctx.fillRect(0, 0, w, h);

        /* THE ORIGIN MOVES TO THE TRIM'S TOP-LEFT, and everything below is in
           document coordinates from there. Art that runs into the bleed sits
           at negative x or y — exactly what core/gatefold.js's header
           promised from version 1.0, and why changing a format's bleed later
           never translates a single element. For a pixel document the bleed
           is 0 and this is the identity, so no square cover moves by so much
           as a pixel. */
        ctx.translate(m.origin.x, m.origin.y);

        for (const el of doc.elements) drawElement(ctx, el, o.measure);

        // Last, so it reads as being on top of the artwork it will join.
        if (o.preview) drawElement(ctx, o.preview, o.measure);

        // Under the chrome: always-on lines must not obscure the handles.
        if (o.panels && o.panels.length) drawPanelLines(ctx, o.panels, m);

        if (o.selectedId != null) {
            const sel = doc.elements.find((el) => el.id === o.selectedId);
            if (sel && sel.visible !== false) drawSelection(ctx, sel, o.measure);
        }

        // Over the chrome as well as the artwork: a guide that a selection box
        // crosses is a guide you cannot read at the moment you need it.
        if (o.guides && o.guides.length) drawGuides(ctx, o.guides, m);
        ctx.restore();
    }

    App.render = {
        render: render,
        drawElement: drawElement,
        drawSelection: drawSelection,
        drawGuides: drawGuides,
        drawPanelLines: drawPanelLines,
        applyRotation: applyRotation,
        DRAW: DRAW,
    };
}());
