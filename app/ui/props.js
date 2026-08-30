// ui/props.js — the property panel: static markup, wired once.
//
// The panel's controls live in index.html and this binds them. It is
// deliberately NOT the descriptor-driven, innerHTML-rebuilding inspector
// deck-press uses: this panel holds a colour input being dragged, a hex field
// with a caret in it, and four range sliders firing `input` continuously.
// Rebuilding the DOM under any of those loses the drag and the focus, which
// is a worse trade than the markup being in two files.
//
// Two disciplines run through everything here:
//
//   STROKES. A slider or picker fires `input` continuously and `change` once.
//   `input` opens ONE undo entry (session.beginStroke is latched) and repaints;
//   `change` closes it. So a drag of the fill picker is one undo step, not two
//   hundred, and letting go is what commits.
//
//   SYNC IS ONE-WAY AT A TIME. syncFrom() writes the element into the
//   controls and is called when the selection changes; the listeners write the
//   controls into the element. They never run against each other because
//   assigning .value does not fire input.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const $ = (id) => document.getElementById(id);
    const S = () => App.session;

    let syncing = false;

    /* ── reading the panel: the style a new element is born with ── */

    function currentStyle() {
        return {
            fill: $('noFillBtn').classList.contains('active') ? 'none' : $('fillColor').value,
            stroke: $('noStrokeBtn').classList.contains('active') ? 'none' : $('strokeColor').value,
            strokeWidth: parseInt($('strokeWidth').value, 10),
            wavelength: parseInt($('wavelength').value, 10) || 5,
            waveMode: $('noFillBtn').classList.contains('active') ? 'open' : 'filled',
            steps: parseInt($('stepCount').value, 10) || 5,
            duty: (parseInt($('dutyCycle').value, 10) || 20) / 100,
        };
    }

    /* ── writing to the element ── */

    function apply(fn) {
        const el = S().selectedElement();
        if (!el || syncing) return;
        fn(el);
        App.canvas.schedule();
        if (App.layers) App.layers.render();
    }

    /* The colour and stroke controls stay live while an image is selected,
       because they are also the style the NEXT element is born with. What
       they write must not land on the image: ui/import.js puts 'none' on its
       fill and stroke on purpose, and a stroke width dragged over a selected
       photo would otherwise draw a border round it. */
    function applyStyle(fn) {
        const el = S().selectedElement();
        if (el && !App.element.stylable(el.type)) return;
        apply(fn);
    }

    /* ── colour pairs ──
       A <input type="color"> and a hex field that must agree. Both write the
       element; each writes the other. */
    function wireColorPair(pickerId, hexId, prop) {
        const picker = $(pickerId);
        const hex = $(hexId);
        const noBtn = prop === 'fill' ? $('noFillBtn') : prop === 'stroke' ? $('noStrokeBtn') : null;

        const set = (value, fromHex) => {
            if (fromHex) picker.value = value; else hex.value = value;
            if (noBtn) noBtn.classList.remove('active');
            if (prop === 'bg') {
                S().beginStroke();
                App.gatefold.get().bgColor = value;
                App.canvas.schedule();
                return;
            }
            applyStyle((el) => { S().beginStroke(); el[prop] = value; });
        };

        picker.addEventListener('input', () => set(picker.value, false));
        picker.addEventListener('change', () => S().commitStroke());

        hex.addEventListener('input', () => {
            // normalizeHex returns null for a half-typed value, which means
            // "leave it alone" — not an error to report at every keystroke.
            const v = App.palette.normalizeHex(hex.value);
            if (v && v !== 'none') set(v, true);
        });
        hex.addEventListener('change', () => {
            const v = App.palette.normalizeHex(hex.value);
            if (v && v !== 'none') { hex.value = v; picker.value = v; }
            S().commitStroke();
        });
    }

    /* ── ranges ──
       value -> element, with the readout kept in step. `format` renders the
       label; `read` turns the slider's integer into what the element stores. */
    function wireRange(id, valId, prop, opts) {
        const input = $(id);
        const out = $(valId);
        const o = opts || {};
        const read = o.read || ((v) => v);
        const format = o.format || ((v) => String(v));

        input.addEventListener('input', () => {
            const raw = parseInt(input.value, 10);
            out.textContent = format(raw);
            if (syncing) return;
            S().beginStroke();
            if (o.onInput) o.onInput(read(raw));
            else if (o.style) applyStyle((el) => { el[prop] = read(raw); });
            else apply((el) => { el[prop] = read(raw); });
        });
        input.addEventListener('change', () => S().commitStroke());
    }

    /* ── visibility ──
       Which groups are relevant depends on BOTH the selected element and the
       active tool: the wave controls show while a wave tool is armed so the
       frequency can be set before drawing, which is how the original worked. */
    function updateVisibility() {
        const tool = App.tools.getTool();
        const el = S().selectedElement();
        const isWaveTool = App.element.isWave(tool);
        const isWaveEl = !!el && App.element.isWave(el.type);
        const isText = tool === 'text' || (!!el && el.type === 'text');

        $('textProps').hidden = !isText;
        $('fontSizeGroup').hidden = !isText;
        $('editTextBtn').hidden = !(el && el.type === 'text');
        $('rotationGroup').hidden = !el;
        $('opacityGroup').hidden = !el;
        $('zorderGroup').hidden = !el;
        $('lockGroup').hidden = !el;
        $('imageScaleGroup').hidden = !(el && el.type === 'image');
        $('waveProps').hidden = !(isWaveTool || isWaveEl);
        $('waveModeGroup').hidden = !isWaveEl;
        $('stepCountGroup').hidden = !(tool === 'step' || (el && el.type === 'step'));
        $('dutyGroup').hidden = !(tool === 'pulse' || (el && el.type === 'pulse'));
    }

    /* ── the element -> the panel ── */

    function syncFrom(el) {
        updateVisibility();
        if (!el) return;

        syncing = true;
        try {
            /* ONLY FOR A TYPE THESE CONTROLS DESCRIBE. An image carries
               fill: 'none', stroke: 'none' as placeholders — ui/import.js
               says why — and reading those back latches the NO-FILL and
               NO-STROKE buttons on. currentStyle() reads those same two
               buttons to decide what every new element is born with, so one
               import used to leave all later text and shapes with no fill
               and no stroke: created, counted, selectable and invisible. */
            if (App.element.stylable(el.type)) {
                if (el.fill && el.fill !== 'none') {
                    $('fillColor').value = el.fill;
                    $('fillHex').value = el.fill;
                    $('noFillBtn').classList.remove('active');
                } else if (el.fill === 'none') {
                    $('noFillBtn').classList.add('active');
                }

                if (el.stroke && el.stroke !== 'none') {
                    $('strokeColor').value = el.stroke;
                    $('strokeHex').value = el.stroke;
                    $('noStrokeBtn').classList.remove('active');
                } else if (el.stroke === 'none') {
                    $('noStrokeBtn').classList.add('active');
                }

                if (el.strokeWidth) {
                    $('strokeWidth').value = el.strokeWidth;
                    $('strokeWidthVal').textContent = el.strokeWidth;
                }
            }

            if (el.type === 'text') {
                if (el.font) RetroDropdown.setValue('fontSelectDropdown', el.font);
                if (el.fontSize) {
                    $('fontSize').value = el.fontSize;
                    $('fontSizeVal').textContent = el.fontSize;
                }
            }

            const rot = (((Math.round(el.rotation || 0)) % 360) + 360) % 360;
            $('rotation').value = rot;
            $('rotationVal').textContent = rot + '°';

            const wl = el.wavelength || 5;
            $('wavelength').value = wl;
            $('wavelengthVal').textContent = wl;

            const mode = el.waveMode || 'filled';
            $('waveFilledBtn').classList.toggle('active', mode === 'filled');
            $('waveOpenBtn').classList.toggle('active', mode === 'open');

            const steps = el.steps || 5;
            $('stepCount').value = steps;
            $('stepCountVal').textContent = steps;

            const duty = (el.duty || 0.2) * 100;
            $('dutyCycle').value = duty;
            $('dutyCycleVal').textContent = Math.round(duty) + '%';

            const op = el.opacity != null ? el.opacity : 100;
            $('opacity').value = op;
            $('opacityVal').textContent = op + '%';

            /* The button says what pressing it will DO, not what the state
               is: a locked element offers UNLOCK. Getting this backwards on
               a control that is also the only way out of the state is how
               someone ends up stuck with a photo they cannot move. */
            const locked = el.locked === true;
            $('lockBtn').innerHTML = locked ? '&#128275; UNLOCK' : '&#128274; LOCK';
            $('lockBtn').classList.toggle('active', locked);

            if (el.type === 'image') {
                /* origW/origH is what SCALE is a percentage OF. An image that
                   has been fitted has it re-based, so 100% means "as fitted"
                   rather than "as imported" — without that, the next nudge of
                   the slider would snap a fitted image back to its import
                   size. */
                if (!el.origW) { el.origW = el.w; el.origH = el.h; }
                const scale = Math.round((el.w / el.origW) * 100);
                $('imageScale').value = Math.min(500, Math.max(10, scale));
                $('imageScaleVal').textContent = scale + '%';
                $('imageDims').textContent = `${Math.round(el.w)} × ${Math.round(el.h)}`;
            }
        } finally {
            syncing = false;
        }
    }

    /* ── init ── */

    function init() {
        wireColorPair('fillColor', 'fillHex', 'fill');
        wireColorPair('strokeColor', 'strokeHex', 'stroke');
        wireColorPair('bgColor', 'bgHex', 'bg');

        wireRange('strokeWidth', 'strokeWidthVal', 'strokeWidth', { style: true });
        wireRange('rotation', 'rotationVal', 'rotation', { format: (v) => v + '°' });
        wireRange('opacity', 'opacityVal', 'opacity', { format: (v) => v + '%' });
        wireRange('wavelength', 'wavelengthVal', 'wavelength');
        wireRange('stepCount', 'stepCountVal', 'steps');
        wireRange('dutyCycle', 'dutyCycleVal', 'duty', {
            format: (v) => v + '%',
            read: (v) => v / 100,
        });
        wireRange('fontSize', 'fontSizeVal', 'fontSize');
        wireRange('imageScale', 'imageScaleVal', null, {
            format: (v) => v + '%',
            onInput: (pct) => apply((el) => {
                if (el.type !== 'image' || !el.origW) return;
                el.w = el.origW * pct;
                el.h = el.origH * pct;
                $('imageDims').textContent = `${Math.round(el.w)} × ${Math.round(el.h)}`;
            }),
        });

        // ── the no-fill / no-stroke toggles ──
        for (const [btnId, prop, pickerId] of [
            ['noFillBtn', 'fill', 'fillColor'],
            ['noStrokeBtn', 'stroke', 'strokeColor'],
        ]) {
            $(btnId).addEventListener('click', () => {
                const btn = $(btnId);
                btn.classList.toggle('active');
                const off = btn.classList.contains('active');
                applyStyle((el) => {
                    S().pushUndo();
                    el[prop] = off ? 'none' : $(pickerId).value;
                });
            });
        }

        // ── wave mode ──
        for (const [btnId, mode] of [['waveFilledBtn', 'filled'], ['waveOpenBtn', 'open']]) {
            $(btnId).addEventListener('click', () => {
                $('waveFilledBtn').classList.toggle('active', mode === 'filled');
                $('waveOpenBtn').classList.toggle('active', mode === 'open');
                apply((el) => { S().pushUndo(); el.waveMode = mode; });
            });
        }

        // ── rotation nudge buttons ──
        for (const [btnId, delta] of [['rotMinus', -5], ['rotPlus', 5]]) {
            $(btnId).addEventListener('click', () => apply((el) => {
                S().pushUndo();
                el.rotation = (((el.rotation || 0) + delta) % 360 + 360) % 360;
                syncFrom(el);
            }));
        }

        // ── lock ──
        $('lockBtn').addEventListener('click', () => S().toggleLock());

        // ── z-order ──
        $('bringForwardBtn').addEventListener('click', () => {
            const el = S().selectedElement();
            if (el) S().reorder(el.id, 1);
        });
        $('sendBackBtn').addEventListener('click', () => {
            const el = S().selectedElement();
            if (el) S().reorder(el.id, -1);
        });

        // ── fit to canvas ──
        for (const [btnId, mode] of [['imageCoverBtn', 'cover'], ['imageContainBtn', 'contain']]) {
            $(btnId).addEventListener('click', () => apply((el) => {
                if (el.type !== 'image') return;
                S().pushUndo();
                const px = App.gatefold.canvasSize(App.gatefold.get().size);
                Object.assign(el, App.geometry.fit(el, mode, { x: 0, y: 0, w: px, h: px }));
                // Re-base, so 100% now means "as fitted".
                el.origW = el.w;
                el.origH = el.h;
                syncFrom(el);
            }));
        }

        // ── the font picker ──
        RetroDropdown.setup('fontSelectDropdown', (font) => apply((el) => {
            if (el.type !== 'text') return;
            S().pushUndo();
            el.font = font;
        }));

        updateVisibility();
    }

    App.props = {
        init: init,
        syncFrom: syncFrom,
        updateVisibility: updateVisibility,
        currentStyle: currentStyle,
    };
}());
