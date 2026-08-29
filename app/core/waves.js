// core/waves.js — the six waveform samplers, as functions of t.
//
// Lifted out of canvas.js, where each one existed only as the closure passed
// to drawWave() and could therefore not be tested or reasoned about apart
// from a canvas context. Here they are what they always were — maps from a
// phase to an amplitude in -1..1 — and drawWave's sampling loop becomes
// samplePath(), which returns points that ui/render.js strokes.
//
// t is in CYCLES, not radians: t = 1 is one full period. Every sampler is
// periodic in 1.
//
// Pure: no DOM, no canvas.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const TAU = Math.PI * 2;

    function sine(t) {
        return Math.sin(t * TAU);
    }

    function squarewave(t) {
        return Math.sin(t * TAU) >= 0 ? 1 : -1;
    }

    function sawtooth(t) {
        return 2 * (t - Math.floor(t + 0.5));
    }

    function trianglewave(t) {
        return 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;
    }

    /**
     * A staircase of `steps` levels per cycle.
     *
     * THE DIVISOR IS GUARDED, and it is a real bug rather than a defensive
     * flourish. The original divided by `steps - 1` directly. The slider that
     * feeds it floors at 2, so nobody ever saw it — but a loaded project file
     * is not a slider, and `steps: 1` makes that 0/0, which is NaN, which
     * propagates into every point of the path, and a path of NaN coordinates
     * draws absolutely nothing. A wave that silently vanishes when a file is
     * opened is exactly the failure a format needs to be immune to.
     *
     * With one step the answer is a flat line at the bottom of the box, which
     * is what a single-level staircase honestly is.
     */
    function step(t, opts) {
        const n = Math.max(1, Math.floor((opts && opts.steps) || 5));
        const divisor = n > 1 ? n - 1 : 1;
        const mod = t - Math.floor(t);
        return (Math.floor(mod * n) / divisor) * 2 - 1;
    }

    /** High for the first `duty` of each cycle, low for the rest. */
    function pulse(t, opts) {
        const duty = (opts && opts.duty) || 0.2;
        const mod = t - Math.floor(t);
        return mod < duty ? 1 : -1;
    }

    const SAMPLERS = {
        sine: sine,
        squarewave: squarewave,
        sawtooth: sawtooth,
        trianglewave: trianglewave,
        step: step,
        pulse: pulse,
    };

    function samplerFor(type) {
        return SAMPLERS[type] || null;
    }

    /**
     * The wave as points in canvas space, left edge to right edge.
     *
     * `Math.max(64, round(w))` is the original's resolution rule: about one
     * sample per horizontal pixel, but never so few that a small wave becomes
     * a polygon. Kept exactly, because changing it changes what every existing
     * cover looks like.
     *
     * The frequency fallback is also the original's: an element with no
     * wavelength gets one cycle per 100px of width rather than one cycle
     * total, so a wide wave dragged out before the slider is touched looks
     * like a wave instead of a single hump.
     *
     * Returns steps + 1 points; the first is exactly at x and the last exactly
     * at x + w, so a filled wave closes on the box rather than near it.
     */
    function samplePath(el) {
        const fn = samplerFor(el.type);
        if (!fn) return [];

        const midY = el.y + el.h / 2;
        const amp = el.h / 2;
        const freq = el.wavelength || Math.max(1, Math.round(el.w / 100));
        const steps = Math.max(64, Math.round(el.w));

        const points = [];
        for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            points.push([el.x + f * el.w, midY - amp * fn(f * freq, el)]);
        }
        return points;
    }

    App.waves = {
        TYPES: Object.keys(SAMPLERS),
        SAMPLERS: SAMPLERS,
        samplerFor: samplerFor,
        samplePath: samplePath,
    };
}());
