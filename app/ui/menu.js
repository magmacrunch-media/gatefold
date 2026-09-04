// ui/menu.js — what this app's menu items mean.
//
// The bar's behaviour — open, close, hover-to-switch, Escape, the state
// refresh on every open — is MagmaKit.menu (magma-kit 0.2.0), extracted from
// sprite-forge once this app wrote the second copy. What is left here is the
// only part that is about album covers: the actions map, and the two
// predicates that say when an item is dead.
//
// IT STILL OWNS NO BEHAVIOUR. Every entry routes to something that already
// exists — the same functions the buttons and the keyboard call — and the
// View items are dispatched by CLICKING the control they name via
// data-toggles, so the menu can never become a second implementation of a
// toggle and then drift from it.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const ACTIONS = {
        'project:new': () => App.projectUI.newProject(),
        'project:open': () => App.projectUI.open(),
        'project:save': () => App.projectUI.save(),
        'project:save-as': () => App.projectUI.saveAs(),
        'app:quit': async () => {
            // The same question Open and New ask, asked once more on the way
            // out. Only then does the Rust side get told to exit.
            if (!await App.confirm.discard('Quit?')) return;
            if (App.fs) App.fs.quit();
        },

        'file:import': () => App.import.fromDialog(),
        'file:export': () => App.export.exportPNG(),
        /* A setting, not a command: it changes what the NEXT export writes.
           It sits in File beside Export rather than in View because it is a
           property of the file, not of what is on screen — the marks are
           never drawn in the editor. */
        'file:print-marks': () => App.export.setMarks(!App.export.marksOn()),

        'edit:undo': () => App.session.undo(),
        'edit:redo': () => App.session.redo(),
        'edit:copy': () => App.session.copy(),
        'edit:paste': () => App.session.pasteInternal(),
        'edit:delete': () => App.session.remove(),
        'edit:clear': () => document.getElementById('clearBtn').click(),
        /* Both were in the markup from the day the lock shipped and in
           NEITHER map here, so the two Edit items opened, highlighted and did
           nothing while Ctrl+L worked — ui/session.js owns the keyboard's
           action map and this one is separate. Same functions, as every entry
           in this file is. */
        'edit:lock': () => App.session.toggleLock(),
        'edit:unlock-all': () => App.session.unlockAll(),

        // Proxied by the kit's data-toggles rule; no entry needed for the
        // check mark, only for the click.
        'view:layers': (item) => document.getElementById(item.dataset.toggles).click(),
        'view:reference': (item) => document.getElementById(item.dataset.toggles).click(),
        /* The one View item with no control to proxy: the fold and safe-margin
           overlay is a property of the frame, not of a panel that can be
           opened. So it owns its state in ui/session.js and reports it
           through stateOf below. */
        'view:print-guides': () => App.session.setPanelLines(!App.session.panelLinesOn()),

        'help:reference': () => App.helpUI.reference(),
        'help:credits': () => App.helpUI.credits(),
    };

    /** Which items are dead right now. Asked fresh every time a menu opens. */
    function stateOf(action) {
        switch (action) {
            case 'edit:undo': return { disabled: !App.session.canUndo() };
            case 'edit:redo': return { disabled: !App.session.canRedo() };
            case 'edit:copy':
            case 'edit:delete':
            case 'edit:lock': return { disabled: !App.session.selectedElement() };
            /* NOT disabled when nothing is locked. It is the only way back to
               an element that hit testing skips, so it answers even when the
               answer is "nothing was" — which it says in a toast. */
            case 'edit:paste': return { disabled: !App.session.hasClipboard() };
            /* Dead without a bleed. A square cover is not cut out of a larger
               sheet, so there is no trim to mark and nowhere to put a mark —
               ticking this on would grow the export by nothing and add
               nothing to it. */
            case 'file:print-marks': return {
                checked: App.export.marksOn(),
                disabled: !App.marks.wanted(App.formats.metrics(App.gatefold.get().size)),
            };
            /* Dead when the overlay would draw nothing but the trim, which
               is the canvas edge and says nothing. That is the square covers.
               It was gated on the PANEL COUNT, which was the same test right
               up until a record jacket arrived: one face, no folds, and a
               quarter inch of safe margin that is the whole reason to want
               the overlay on. Ask what there is to draw, not what shape the
               document is. */
            case 'view:print-guides': return {
                checked: App.session.panelLinesOn(),
                disabled: !App.panels.lines(App.formats.metrics(App.gatefold.get().size))
                    .some(function (l) { return l.kind !== 'trim'; }),
            };
            default: return null;   // the kit falls back to data-toggles
        }
    }

    let bar = null;

    function init() {
        if (!App.tier.current.has('menubar')) return;
        bar = window.MagmaKit.menu.create(document.getElementById('menubar'), {
            actions: ACTIONS,
            state: stateOf,
        });
    }

    App.menu = {
        init: init,
        close: () => bar && bar.close(),
        sync: () => bar && bar.sync(),
        ACTIONS: ACTIONS,
    };
}());
