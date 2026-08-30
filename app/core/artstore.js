// core/artstore.js — the app's art store.
//
// The behaviour is MagmaKit.artstore (magma-kit 0.2.0), extracted once two
// hand-rolled copies existed: this app's imageStore/imageCache/refByData maps
// in its old canvas.js, and deck-press's module, whose header cites this app's
// measurements as the reason it exists.
//
// One store per document. The kit owns what it does; this names the instance
// the rest of the app shares.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    App.artstore = window.MagmaKit.artstore.create();
}());
