// ui/confirm.js — one question, asked the same way in both builds.
//
// Deliberately the kit's <dialog> rather than the native dialog('ask') the
// desktop could use, and deck-forge's reasoning is the right one: using the
// in-page modal in BOTH builds means the confirmation path is exercised every
// time the app is opened with `npm run serve`, instead of only under Tauri
// where it is hardest to reach. It also looks like the app — a Windows
// message box in Segoe UI in the middle of a Press Start 2P scanline reads as
// a different program.
//
// window.confirm is the fallback of last resort and is not expected to run:
// it is unreliable in a WebView and blocks the event loop.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    let asker = null;

    function ask(message) {
        const dlg = document.getElementById('confirm-dialog');
        if (!dlg || !window.MagmaKit || !window.MagmaKit.modal) {
            return Promise.resolve(window.confirm(message));
        }
        if (!asker) {
            asker = window.MagmaKit.modal.asker(dlg, { closers: ['confirm-cancel'] });
        }

        const slot = document.getElementById('confirm-message');
        if (slot) slot.textContent = message;

        return asker.ask(function (settle) {
            // Assigned rather than added, so repeated asks do not stack
            // listeners and answer the same question several times.
            const ok = document.getElementById('confirm-ok');
            if (ok) ok.onclick = function () { settle(true); };
        }).then(function (answer) {
            // asker resolves null on every dismissal — the x, CANCEL, the
            // backdrop, Escape. All of them mean no.
            return answer === true;
        });
    }

    /** Ask only when there is something to lose. */
    function discard(what) {
        if (!App.session || !App.session.isDirty()) return Promise.resolve(true);
        return ask(`${what} You have unsaved changes to this cover.`);
    }

    App.confirm = { ask: ask, discard: discard };
}());
