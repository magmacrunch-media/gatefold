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

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const $ = (id) => document.getElementById(id);

    let asker = null;

    /** Show the chosen face in the textarea, so you type in what you get. */
    function previewFont(font) {
        const input = $('modalTextInput');
        if (input) input.style.fontFamily = `"${font}", sans-serif`;
    }

    function ensure() {
        if (asker) return asker;
        const dlg = $('textModal');
        if (!dlg || !window.MagmaKit || !window.MagmaKit.modal) return null;
        asker = window.MagmaKit.modal.asker(dlg, { closers: ['modalCancel'] });

        /* RetroDropdown.setup is what BINDS a dropdown — without it the list
           has no click handlers, so it never opens and its .active class never
           moves. getValue() reads that class, so an unwired picker silently
           returns whatever setValue last wrote and the choice is unmakeable.
           This one was missed in the port and the font could not be chosen at
           all; tests/wiring.test.mjs now checks every dropdown in the markup
           against the setup calls. Once, here, because setup also attaches a
           document-level click listener. */
        RetroDropdown.setup('modalFontSelectDropdown', previewFont);
        return asker;
    }

    /**
     * Show the dialog seeded with `initial`, and resolve to
     * { text, font, fontSize } or null if it was dismissed.
     */
    function ask(heading, initial) {
        const a = ensure();
        if (!a) return Promise.resolve(null);

        const seed = initial || {};
        const header = $('textModal').querySelector('.modal-header');
        // Keep the close button; only the label changes between add and edit.
        if (header) header.firstChild.nodeValue = heading;

        return a.ask(function (settle) {
            const input = $('modalTextInput');
            const sizeInput = $('modalFontSize');
            const sizeOut = $('modalFontSizeVal');

            input.value = seed.text || '';
            sizeInput.value = seed.fontSize || 48;
            sizeOut.textContent = sizeInput.value;
            // setValue moves the .active class but fires no handler, so the
            // preview has to be seeded alongside it or the textarea shows the
            // last-chosen face rather than this element's.
            const font = seed.font || 'Press Start 2P';
            RetroDropdown.setValue('modalFontSelectDropdown', font);
            previewFont(font);

            const commit = function () {
                const text = input.value;
                /* An empty ADD is NOT a dismissal, and conflating the two is
                   what made a WebKit input bug look like vanishing text: the
                   textarea took no keystrokes, ADD saw an empty string, and
                   the dialog closed exactly as if CANCEL had been pressed.
                   Say something and stay open — whatever the reason the box is
                   empty, closing silently is the one response that teaches the
                   user nothing. */
                if (!text.trim()) {
                    if (window.Toast) Toast.show('NOTHING TO ADD');
                    input.focus();
                    return;
                }
                settle({
                    text: text,
                    font: RetroDropdown.getValue('modalFontSelectDropdown', 'Press Start 2P'),
                    fontSize: parseInt(sizeInput.value, 10) || 48,
                });
            };

            /* Assigned rather than added: repeated asks must not stack
               listeners and answer the same question several times over. */
            $('modalAdd').onclick = commit;
            sizeInput.oninput = function () { sizeOut.textContent = sizeInput.value; };
            input.onkeydown = function (e) {
                // Enter commits, Shift+Enter is a newline — this is a
                // multi-line field and both are wanted.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            };

            // Focus after the dialog is actually open, or the caret goes
            // nowhere.
            requestAnimationFrame(function () { input.focus(); });
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
        ask('ADD TEXT', {}).then(function (answer) {
            if (!answer) return;
            const el = App.element.create('text', Object.assign(
                { x: x, y: y }, App.props.currentStyle(), answer
            ));
            App.session.add(el);
            /* Text with neither a fill nor a stroke draws nothing at all.
               That is a legitimate thing to ask a SHAPE for and never a
               thing anyone means by "add text", so say so rather than
               leaving an element that is selected and counted and cannot
               be seen — the same silence as the bug this used to be. */
            if (el.fill === 'none' && el.stroke === 'none' && window.Toast) {
                Toast.show('THAT TEXT HAS NO FILL AND NO STROKE');
            }
        }).catch(fail);
    }

    /** Edit the text of an existing element. */
    function edit(el) {
        ask('EDIT TEXT', el).then(function (answer) {
            if (!answer) return;
            App.session.pushUndo();
            Object.assign(el, answer);
            App.session.render();
            App.props.syncFrom(el);
        }).catch(fail);
    }

    App.textmodal = { ask: ask, add: add, edit: edit };
}());
