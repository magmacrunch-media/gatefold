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

    function ensure() {
        if (asker) return asker;
        const dlg = $('textModal');
        if (!dlg || !window.MagmaKit || !window.MagmaKit.modal) return null;
        asker = window.MagmaKit.modal.asker(dlg, { closers: ['modalCancel'] });
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
            RetroDropdown.setValue('modalFontSelectDropdown', seed.font || 'Press Start 2P');

            const commit = function () {
                const text = input.value;
                // An empty string is not text. Dismissing and confirming with
                // nothing typed mean the same thing, so they answer the same.
                if (!text.trim()) { settle(null); return; }
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

    /** Place a new text element at (x, y). */
    function add(x, y) {
        ask('ADD TEXT', {}).then(function (answer) {
            if (!answer) return;
            App.session.add(App.element.create('text', Object.assign(
                { x: x, y: y }, App.props.currentStyle(), answer
            )));
        });
    }

    /** Edit the text of an existing element. */
    function edit(el) {
        ask('EDIT TEXT', el).then(function (answer) {
            if (!answer) return;
            App.session.pushUndo();
            Object.assign(el, answer);
            App.session.render();
            App.props.syncFrom(el);
        });
    }

    App.textmodal = { ask: ask, add: add, edit: edit };
}());
