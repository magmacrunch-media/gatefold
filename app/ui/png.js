// ui/png.js — a canvas as PNG bytes.
//
// Copied from sprite-forge/app/ui/png.js. Small and separate for the same
// reason it is there: it is the one piece of the export that is pure
// encoding, and it belongs in ui/ rather than core/ because a Node suite has
// no toBlob and shimming a real PNG encoder to test three lines would be
// worse than not testing them.
//
// The .catch is the whole reason this is a function and not an inline
// toBlob(): without it a rejected arrayBuffer() leaves the promise pending
// forever, and every caller awaits it — the export hangs with no toast, no
// error, and nothing in the log.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    App.png = {
        /** @returns {Promise<Uint8Array>} the encoded PNG */
        bytes: function (canvas) {
            return new Promise(function (resolve, reject) {
                canvas.toBlob(function (blob) {
                    if (!blob) { reject(new Error('could not encode PNG')); return; }
                    blob.arrayBuffer().then(
                        function (a) { resolve(new Uint8Array(a)); },
                        reject
                    );
                }, 'image/png');
            });
        },
    };
}());
