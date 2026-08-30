// ui/textmodal.js — add and edit text, on MagmaKit.modal.
//
// The web tool's version was a position:fixed div with `hidden`, three
// separate ways out wired by hand, and a pair of module-level flags tracking
// whether it was adding or editing. This is a real <dialog> on the kit's
// asker(): ask(populate) resolves to whatever populate settles, or null on ANY
// dismissal — the x, the CANCEL button, the backdrop, or Escape — and it
// settles exactly once whichever way is taken.
//
// So there is no "am I adding or editing" state here at all. Both callers
// await the same promise and decide for themselves what to do with the answer.
//
// THREE THINGS THIS DIALOG DOES THAT THE PORT DID NOT:
//
//   IT REMEMBERS. It used to open on Press Start 2P at 48px every time, so a
//   cover set in one face was a trip through the same two controls for every
//   line on it. The choice is kept in MagmaKit.prefs — localStorage, so it
//   survives a restart and works in LITE and FULL alike.
//
//   IT PREVIEWS. The text is drawn on the canvas as it is typed, through
//   session.setPreview(), which draws an element that is NOT in the document.
//   That distinction is the whole design: a preview that might still be
//   cancelled must not be counted by the stats, listed by the layers panel or
//   reachable by undo. Editing is the other half — there the element is real,
//   so its fields change live and are put back if the dialog is dismissed.
//
//   IT CARRIES ITS OWN COLOUR. Fill and stroke used to have to be set in the
//   property panel BEFORE opening this, which means knowing what you want
//   before you have seen it. They are seeded from the panel and go back to it
//   through session.add(), which syncs the panel from whatever it adds.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const $ = (id) => document.getElementById(id);

    const DEFAULT_FONT = 'Press Start 2P';
    const DEFAULT_SIZE = 48;

    /* The remembered face and size. read() gives null when there is nothing
       usable, so every read below is guarded rather than merged. */
    const prefs = window.MagmaKit.prefs.create('gatefold.text');

    let asker = null;

    /** Show the chosen face in the textarea, so you type in what you get. */
    function previewFont(font) {
        const input = $('modalTextInput');
        if (input) input.style.fontFamily = `"${font}", sans-serif`;
    }

    /* ── placement ──
       The UA centres a modal <dialog> in the VIEWPORT. The chrome above the
       canvas — the header and the tool nav — is far taller than the footer
       below it, so viewport-centred lands the box high of the artwork it is
       about. This centres it on the canvas instead.

       Inline styles, set on open and cleared on close: if this never runs the
       UA's own centring is still in force and the dialog is merely where it
       always was. A placement tweak must not be able to lose the dialog. */
    function centreOnCanvas(dlg) {
        const canvas = App.canvas && App.canvas.element && App.canvas.element();
        if (!canvas || !dlg.open) return;
        const c = canvas.getBoundingClientRect();
        const d = dlg.getBoundingClientRect();
        if (!c.width || !d.width) return;

        const gap = 8;
        const left = c.left + (c.width - d.width) / 2;
        const top = c.top + (c.height - d.height) / 2;

        dlg.style.margin = '0';
        dlg.style.inset = 'auto';
        dlg.style.left = Math.round(
            Math.max(gap, Math.min(left, window.innerWidth - d.width - gap))) + 'px';
        dlg.style.top = Math.round(
            Math.max(gap, Math.min(top, window.innerHeight - d.height - gap))) + 'px';
    }

    function clearPlacement(dlg) {
        dlg.style.margin = '';
        dlg.style.inset = '';
        dlg.style.left = '';
        dlg.style.top = '';
    }

    /* ── the colour rows ──
       The same shape as ui/props.js's pairs: a swatch and a hex field that
       write each other, and a button that means "none". Wired once. */
    function wireColorPair(pickerId, hexId, noBtnId, onChange) {
        const picker = $(pickerId);
        const hex = $(hexId);
        const noBtn = $(noBtnId);
        if (!picker || !hex || !noBtn) return;

        picker.addEventListener('input', function () {
            hex.value = picker.value;
            noBtn.classList.remove('active');
            onChange();
        });
        hex.addEventListener('input', function () {
            // normalizeHex returns null for a half-typed value, which means
            // "leave it alone" rather than "that is wrong".
            const v = App.palette.normalizeHex(hex.value);
            if (!v || v === 'none') return;
            picker.value = v;
            noBtn.classList.remove('active');
            onChange();
        });
        hex.addEventListener('change', function () {
            const v = App.palette.normalizeHex(hex.value);
            if (v && v !== 'none') { hex.value = v; picker.value = v; }
        });
        noBtn.addEventListener('click', function () {
            noBtn.classList.toggle('active');
            onChange();
        });
    }

    function colorOf(pickerId, noBtnId) {
        return $(noBtnId).classList.contains('active') ? 'none' : $(pickerId).value;
    }

    function setColor(pickerId, hexId, noBtnId, value) {
        const off = !value || value === 'none';
        $(noBtnId).classList.toggle('active', off);
        if (!off) { $(pickerId).value = value; $(hexId).value = value; }
    }

    /** Whatever the controls currently say, as an element's worth of fields. */
    function reading() {
        return {
            text: $('modalTextInput').value,
            font: RetroDropdown.getValue('modalFontSelectDropdown', DEFAULT_FONT),
            fontSize: parseInt($('modalFontSize').value, 10) || DEFAULT_SIZE,
            fill: colorOf('modalFillColor', 'modalNoFillBtn'),
            stroke: colorOf('modalStrokeColor', 'modalNoStrokeBtn'),
        };
    }

    /* Set by ask() so the controls, which are wired exactly once, can reach
       whatever the dialog that is currently up wants done when they change. */
    let onEdit = null;

    function ensure() {
        if (asker) return asker;
        const dlg = $('textModal');
        if (!dlg || !window.MagmaKit || !window.MagmaKit.modal) return null;
        asker = window.MagmaKit.modal.asker(dlg, { closers: ['modalCancel'] });

        const changed = function () { if (onEdit) onEdit(); };

        /* RetroDropdown.setup is what BINDS a dropdown — without it the list
           has no click handlers, so it never opens and its .active class never
           moves. getValue() reads that class, so an unwired picker silently
           returns whatever setValue last wrote and the choice is unmakeable.
           This one was missed in the port and the font could not be chosen at
           all; tests/wiring.test.mjs now checks every dropdown in the markup
           against the setup calls. Once, here, because setup also attaches a
           document-level click listener. */
        RetroDropdown.setup('modalFontSelectDropdown', function (font) {
            previewFont(font);
            changed();
        });

        wireColorPair('modalFillColor', 'modalFillHex', 'modalNoFillBtn', changed);
        wireColorPair('modalStrokeColor', 'modalStrokeHex', 'modalNoStrokeBtn', changed);

        $('modalTextInput').addEventListener('input', changed);
        $('modalFontSize').addEventListener('input', function () {
            $('modalFontSizeVal').textContent = $('modalFontSize').value;
            changed();
        });

        return asker;
    }

    /**
     * Show the dialog seeded with `initial`, and resolve to
     * { text, font, fontSize, fill, stroke } or null if it was dismissed.
     *
     * `live` is called with the current reading on every change, and with null
     * when the dialog goes away by any route at all. Both callers use it to
     * show what is being typed; neither touches history until it settles.
     */
    function ask(heading, initial, live) {
        const a = ensure();
        if (!a) return Promise.resolve(null);

        const dlg = $('textModal');
        const seed = initial || {};
        const header = dlg.querySelector('.modal-header');
        // Keep the close button; only the label changes between add and edit.
        if (header) header.firstChild.nodeValue = heading;

        /* Every way out lands here — commit, CANCEL, the ×, the backdrop and
           Escape — because the preview and the placement have to be undone on
           all of them, not only the one that was thought about. */
        const done = function (value) {
            onEdit = null;
            if (live) live(null);
            clearPlacement(dlg);
            return value;
        };

        return a.ask(function (settle) {
            const input = $('modalTextInput');
            const sizeInput = $('modalFontSize');

            input.value = seed.text || '';
            sizeInput.value = seed.fontSize || DEFAULT_SIZE;
            $('modalFontSizeVal').textContent = sizeInput.value;
            // setValue moves the .active class but fires no handler, so the
            // preview has to be seeded alongside it or the textarea shows the
            // last-chosen face rather than this element's.
            const font = seed.font || DEFAULT_FONT;
            RetroDropdown.setValue('modalFontSelectDropdown', font);
            previewFont(font);

            setColor('modalFillColor', 'modalFillHex', 'modalNoFillBtn', seed.fill);
            setColor('modalStrokeColor', 'modalStrokeHex', 'modalNoStrokeBtn', seed.stroke);

            onEdit = function () { if (live) live(reading()); };

            const commit = function () {
                const value = reading();
                /* An empty ADD is NOT a dismissal, and conflating the two is
                   what made a WebKit input bug look like vanishing text: the
                   textarea took no keystrokes, ADD saw an empty string, and
                   the dialog closed exactly as if CANCEL had been pressed.
                   Say something and stay open — whatever the reason the box is
                   empty, closing silently is the one response that teaches the
                   user nothing. */
                if (!value.text.trim()) {
                    if (window.Toast) Toast.show('NOTHING TO ADD');
                    input.focus();
                    return;
                }
                settle(done(value));
            };

            /* Assigned rather than added: repeated asks must not stack
               listeners and answer the same question several times over. */
            $('modalAdd').onclick = commit;
            input.onkeydown = function (e) {
                // Enter commits, Shift+Enter is a newline — this is a
                // multi-line field and both are wanted.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            };

            /* After the dialog is actually open: the caret goes nowhere
               before that, and it has no dimensions to be measured either.

               A MICROTASK RATHER THAN A FRAME. populate() runs immediately
               before showModal() in the kit, so anything queued here runs
               once that synchronous task finishes — which is after the
               dialog is open, guaranteed, and without waiting on the
               compositor. requestAnimationFrame does not fire at all while
               the window is not being painted, and a dialog that is not
               focused and not placed until the next repaint is a dialog
               that opened wrong. */
            queueMicrotask(function () {
                centreOnCanvas(dlg);
                input.focus();
            });
        }).then(function (answer) {
            // A dismissal resolves null without passing through commit, so it
            // is cleaned up here. done() only ever undoes things, so taking
            // that path twice on a commit would be harmless anyway.
            return answer === null ? done(null) : answer;
        });
    }

    /* Both flows below are promise chains, so anything thrown downstream —
       currentStyle, element.create, session.add — becomes an unhandled
       rejection and produces the SAME symptom as the bug above: nothing
       happens and nothing is said. */
    function fail(err) {
        const msg = err && err.message ? err.message : String(err);
        if (window.Toast) Toast.show('COULD NOT ADD THAT TEXT');
        if (App.fs && App.fs.logLine) App.fs.logLine('ERROR', 'text modal', msg);
    }

    /** Place a new text element at (x, y). */
    function add(x, y) {
        const style = App.props.currentStyle();
        const remembered = prefs.read() || {};

        const seed = {
            font: remembered.font || DEFAULT_FONT,
            fontSize: remembered.fontSize || DEFAULT_SIZE,
            fill: style.fill,
            stroke: style.stroke,
        };

        /* The preview is a whole element rather than a patch, because that is
           what ui/render.js draws. Rebuilt from the current reading on every
           change, and never put in the document. */
        const live = function (now) {
            if (!now || !now.text.trim()) { App.session.setPreview(null); return; }
            App.session.setPreview(Object.assign(
                {}, App.element.defaultsFor('text'), style, now, { x: x, y: y, id: -1 }
            ));
        };

        ask('ADD TEXT', seed, live).then(function (answer) {
            if (!answer) return;
            prefs.write({ font: answer.font, fontSize: answer.fontSize });

            const el = App.element.create('text', Object.assign(
                { x: x, y: y }, style, answer
            ));
            // add() syncs the property panel from what it added, so the colours
            // chosen here become the ones the next element is born with.
            App.session.add(el);

            /* Text with neither a fill nor a stroke draws nothing at all. That
               is a legitimate thing to ask a SHAPE for and never a thing anyone
               means by "add text", so say so rather than leaving an element
               that is selected and counted and cannot be seen — the same
               silence as the bug this used to be. */
            if (el.fill === 'none' && el.stroke === 'none' && window.Toast) {
                Toast.show('THAT TEXT HAS NO FILL AND NO STROKE');
            }
        }).catch(fail);
    }

    /** Edit the text of an existing element. */
    function edit(el) {
        /* The element is already in the document and already drawn, so the
           preview here IS the element: its fields change live and are put back
           if the dialog is dismissed. Nothing reaches history until it settles,
           so a cancelled edit leaves no undo step behind. */
        const FIELDS = ['text', 'font', 'fontSize', 'fill', 'stroke'];
        const original = {};
        for (const k of FIELDS) original[k] = el[k];

        const live = function (now) {
            Object.assign(el, now || original);
            App.canvas.schedule();
        };

        ask('EDIT TEXT', original, live).then(function (answer) {
            // live(null) has already put the original back, so a dismissal
            // needs nothing more and a commit starts from a clean state.
            if (!answer) return;
            App.session.pushUndo();
            Object.assign(el, answer);
            prefs.write({ font: answer.font, fontSize: answer.fontSize });
            App.session.render();
            App.props.syncFrom(el);
        }).catch(fail);
    }

    App.textmodal = { ask: ask, add: add, edit: edit };
}());
