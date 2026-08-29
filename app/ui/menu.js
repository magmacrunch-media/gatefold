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

        'edit:undo': () => App.session.undo(),
        'edit:redo': () => App.session.redo(),
        'edit:copy': () => App.session.copy(),
        'edit:paste': () => App.session.pasteInternal(),
        'edit:delete': () => App.session.remove(),
        'edit:clear': () => document.getElementById('clearBtn').click(),

        // Proxied by the kit's data-toggles rule; no entry needed for the
        // check mark, only for the click.
        'view:layers': (item) => document.getElementById(item.dataset.toggles).click(),
        'view:reference': (item) => document.getElementById(item.dataset.toggles).click(),

        'help:reference': () => App.helpUI.reference(),
        'help:credits': () => App.helpUI.credits(),
    };

    /** Which items are dead right now. Asked fresh every time a menu opens. */
    function stateOf(action) {
        switch (action) {
            case 'edit:undo': return { disabled: !App.session.canUndo() };
            case 'edit:redo': return { disabled: !App.session.canRedo() };
            case 'edit:copy':
            case 'edit:delete': return { disabled: !App.session.selectedElement() };
            case 'edit:paste': return { disabled: !App.session.hasClipboard() };
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
