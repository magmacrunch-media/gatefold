// core/keybindings.js — the whole keyboard, as one table.
//
// MagmaKit.keys turns an event into an action NAME and nothing else: it binds
// no listener, prevents no default, and knows what none of these mean. This
// file is the data it resolves against, and it is data precisely so it can be
// asserted — that no two bindings collide, that every action a surface offers
// exists, and that the ones which must not reach the browser are listed.
//
// The web tool had this as a 100-line if/else chain inside one keydown
// listener in app.js: `if (e.ctrlKey || e.metaKey) { if (e.key === 'z' && ...`
// nested three deep, with the typing guard as a tagName check at the top and
// the tool shortcuts as a bare object at the bottom. Nothing about which keys
// were taken was visible without reading all of it.
//
// Shaped on deck-press's: ONE document listener, and each surface passes the
// actions IT handles, so a key the current surface has no use for falls
// through to the browser rather than being swallowed.
//
// Pure: no DOM.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* MagmaKit.keys matches a single character case-insensitively and a longer
       name ('Escape', 'ArrowLeft', 'F1') exactly against event.key. It maps
       Cmd to ctrl, and refuses anything with Alt held, which belongs to the OS
       and its menus. */
    const BINDINGS = [
        // ── project (FULL only; the resolver still names them, and
        //    ui/project-ui.js returns early when there is no filesystem) ──
        { key: 'n', ctrl: true, action: 'project:new' },
        { key: 'o', ctrl: true, action: 'project:open' },
        { key: 's', ctrl: true, action: 'project:save' },
        { key: 's', ctrl: true, shift: true, action: 'project:save-as' },

        // ── files ──
        { key: 'i', ctrl: true, action: 'file:import' },
        { key: 'e', ctrl: true, action: 'file:export' },

        // ── edit ──
        { key: 'z', ctrl: true, action: 'edit:undo' },
        { key: 'z', ctrl: true, shift: true, action: 'edit:redo' },
        // The other redo everyone's fingers know. Both resolve to one action.
        { key: 'y', ctrl: true, action: 'edit:redo' },
        { key: 'c', ctrl: true, action: 'edit:copy' },
        { key: 'v', ctrl: true, action: 'edit:paste' },
        { key: 'Delete', action: 'edit:delete' },
        { key: 'Backspace', action: 'edit:delete' },

        // ── selection ──
        /* Escape deselects. Clicking bare canvas deselects too, but hit
           testing is on bounding boxes, so an element covering the canvas —
           which is the normal case the moment COVER is used — leaves nowhere
           bare to click and no way back out. This is that escape hatch, and
           it is why Escape is NOT in the kit's never-a-character set: inside
           a field it still means "cancel" and the field keeps it. */
        { key: 'Escape', action: 'select:none' },
        { key: 'ArrowUp', action: 'nudge:up' },
        { key: 'ArrowDown', action: 'nudge:down' },
        { key: 'ArrowLeft', action: 'nudge:left' },
        { key: 'ArrowRight', action: 'nudge:right' },

        // ── tools ──
        // Unmodified letters. The kit's typing guard keeps them out of any
        // input, textarea or contenteditable without this file saying so.
        { key: 'v', action: 'tool:select' },
        { key: 'r', action: 'tool:rect' },
        { key: 'c', action: 'tool:circle' },
        { key: 'l', action: 'tool:line' },
        { key: 't', action: 'tool:text' },

        // ── view / help ──
        { key: 'F7', action: 'view:layers' },
        { key: 'F1', action: 'help:reference' },
    ];

    /* What each surface handles. The editor is the whole app today; the modal
       list exists because a dialog must not let Delete remove the element
       behind it while you are typing a title. */
    const AVAILABLE = {
        editor: BINDINGS.map(function (b) { return b.action; }),
        modal: ['select:none'],
    };

    /* Actions whose default MUST NOT reach the browser: Ctrl+S must not save
       the page, Ctrl+O must not open a file, Ctrl+P is not ours to take.
       Backspace is here because in a WebView an unhandled Backspace outside a
       field has historically meant "go back", and there is nowhere to go back
       to in a single-page tool — it would unload the app. */
    const PREVENT = [
        'project:new', 'project:open', 'project:save', 'project:save-as',
        'file:import', 'file:export',
        'edit:undo', 'edit:redo', 'edit:copy', 'edit:paste', 'edit:delete',
        'nudge:up', 'nudge:down', 'nudge:left', 'nudge:right',
        'view:layers', 'help:reference',
    ];

    /** How far an arrow key moves an element. Shift is the coarse step. */
    const NUDGE = { fine: 1, coarse: 10 };

    /* Rapid nudges collapse into ONE undo entry rather than one per keypress.
       Holding an arrow key for a second is a single intention. */
    const NUDGE_DEBOUNCE_MS = 300;

    function create() {
        return window.MagmaKit.keys.create(BINDINGS);
    }

    App.keybindings = {
        BINDINGS: BINDINGS,
        AVAILABLE: AVAILABLE,
        PREVENT: PREVENT,
        NUDGE: NUDGE,
        NUDGE_DEBOUNCE_MS: NUDGE_DEBOUNCE_MS,
        create: create,
    };
}());
