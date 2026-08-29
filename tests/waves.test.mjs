import { test, eq, ok } from './kit/assert.mjs';

function close(actual, expected, what, tol = 1e-9) {
    if (!(Math.abs(actual - expected) <= tol)) {
        throw new Error(`${what}:\n      got ${actual}\n      want ${expected} (+/- ${tol})`);
    }
}

export default function (M) {
    const W = M.waves;

    test('there are six waveforms and each has a sampler', () => {
        eq(W.TYPES.sort(), ['pulse', 'sawtooth', 'sine', 'squarewave', 'step', 'trianglewave'],
            'the six');
        for (const t of W.TYPES) ok(typeof W.samplerFor(t) === 'function', `${t} samples`);
        eq(W.samplerFor('rect'), null, 'a rectangle is not a waveform');
    });

    /* t is in CYCLES, not radians: t = 1 is one full period. */
    test('sine runs 0 up 1 down through zero to -1 and back', () => {
        close(W.SAMPLERS.sine(0), 0, 'start');
        close(W.SAMPLERS.sine(0.25), 1, 'quarter');
        close(W.SAMPLERS.sine(0.5), 0, 'half');
        close(W.SAMPLERS.sine(0.75), -1, 'three quarters');
        close(W.SAMPLERS.sine(1), 0, 'and back', 1e-12);
    });

    test('square is only ever +1 or -1', () => {
        for (let t = 0; t < 3; t += 0.037) {
            const v = W.SAMPLERS.squarewave(t);
            ok(v === 1 || v === -1, `two-valued at t=${t.toFixed(3)}`);
        }
        eq(W.SAMPLERS.squarewave(0.25), 1, 'high in the first half');
        eq(W.SAMPLERS.squarewave(0.75), -1, 'low in the second');
    });

    test('sawtooth ramps and wraps', () => {
        close(W.SAMPLERS.sawtooth(0), 0, 'zero at the start of a cycle');
        close(W.SAMPLERS.sawtooth(0.25), 0.5, 'ramping up');
        close(W.SAMPLERS.sawtooth(0.4), 0.8, 'near the peak');
        close(W.SAMPLERS.sawtooth(0.6), -0.8, 'wrapped to the bottom');
    });

    test('triangle peaks in the middle of a cycle', () => {
        close(W.SAMPLERS.trianglewave(0), -1, 'starts low');
        close(W.SAMPLERS.trianglewave(0.5), 1, 'peaks at the half');
        close(W.SAMPLERS.trianglewave(1), -1, 'and returns', 1e-12);
    });

    test('every waveform is periodic in 1', () => {
        for (const t of W.TYPES) {
            const fn = W.SAMPLERS[t];
            for (const x of [0.1, 0.33, 0.5, 0.87]) {
                close(fn(x, { steps: 5, duty: 0.2 }), fn(x + 3, { steps: 5, duty: 0.2 }),
                    `${t} repeats at t+3 (t=${x})`, 1e-9);
            }
        }
    });

    test('every waveform stays inside -1..1', () => {
        for (const t of W.TYPES) {
            const fn = W.SAMPLERS[t];
            for (let x = 0; x < 2; x += 0.013) {
                const v = fn(x, { steps: 7, duty: 0.35 });
                ok(v >= -1 && v <= 1, `${t} in range at t=${x.toFixed(3)} (got ${v})`);
            }
        }
    });

    test('step climbs in the number of levels it is given', () => {
        const levels = new Set();
        for (let t = 0; t < 1; t += 0.001) levels.add(W.SAMPLERS.step(t, { steps: 5 }));
        eq(levels.size, 5, 'five distinct levels');
        ok(levels.has(-1) && levels.has(1), 'spanning the full range');
    });

    /* ── the real bug ──
       The original divided by `steps - 1` directly. The slider floors at 2, so
       nobody ever saw it — but a loaded project file is not a slider. steps: 1
       makes that 0/0, which is NaN, which propagates into every point of the
       path, and a path of NaN coordinates draws absolutely nothing. A wave
       that silently vanishes when a file is opened is exactly what a file
       format has to be immune to. */
    test('a single-step staircase does not divide by zero', () => {
        for (const t of [0, 0.25, 0.5, 0.99]) {
            const v = W.SAMPLERS.step(t, { steps: 1 });
            ok(Number.isFinite(v), `finite at t=${t} (got ${v})`);
        }
        eq(W.SAMPLERS.step(0.5, { steps: 1 }), -1, 'one level is honestly a flat line');
    });

    test('a step count below one, or missing, still samples', () => {
        for (const opts of [{ steps: 0 }, { steps: -3 }, {}, undefined]) {
            ok(Number.isFinite(W.SAMPLERS.step(0.4, opts)), `finite for ${JSON.stringify(opts)}`);
        }
    });

    test('pulse is high for exactly its duty cycle', () => {
        eq(W.SAMPLERS.pulse(0, { duty: 0.2 }), 1, 'high at the start');
        eq(W.SAMPLERS.pulse(0.19, { duty: 0.2 }), 1, 'high just inside');
        eq(W.SAMPLERS.pulse(0.2, { duty: 0.2 }), -1, 'low exactly at the boundary');
        eq(W.SAMPLERS.pulse(0.95, { duty: 0.2 }), -1, 'low at the end');
        eq(W.SAMPLERS.pulse(1.1, { duty: 0.2 }), 1, 'and high again next cycle');
    });

    test('the duty extremes hold', () => {
        eq(W.SAMPLERS.pulse(0.04, { duty: 0.05 }), 1, 'a 5% pulse is high early');
        eq(W.SAMPLERS.pulse(0.06, { duty: 0.05 }), -1, 'and low after');
        eq(W.SAMPLERS.pulse(0.94, { duty: 0.95 }), 1, 'a 95% pulse is high nearly throughout');
    });

    /* ── the sampling loop ──
       Resolution is the original's rule and is kept exactly: about one sample
       per horizontal pixel, never fewer than 64 so a small wave does not
       become a polygon. Changing it changes what every existing cover looks
       like. */
    test('a wave samples about once per pixel, and never coarser than 64', () => {
        eq(W.samplePath({ type: 'sine', x: 0, y: 0, w: 400, h: 100, wavelength: 2 }).length,
            401, 'one per pixel plus the closing point');
        eq(W.samplePath({ type: 'sine', x: 0, y: 0, w: 10, h: 100, wavelength: 2 }).length,
            65, 'a narrow wave still gets 64 segments');
    });

    test('the path starts and ends exactly on the box edges', () => {
        const el = { type: 'sine', x: 120, y: 40, w: 300, h: 80, wavelength: 3 };
        const p = W.samplePath(el);
        eq(p[0][0], 120, 'first point at x');
        eq(p[p.length - 1][0], 420, 'last point at x + w');
    });

    test('the path is centred on the box and never leaves it', () => {
        const el = { type: 'trianglewave', x: 0, y: 100, w: 200, h: 60, wavelength: 4 };
        for (const [, y] of W.samplePath(el)) {
            ok(y >= 100 - 1e-9 && y <= 160 + 1e-9, `y=${y} inside the box`);
        }
    });

    test('a path never contains a non-finite coordinate', () => {
        for (const type of W.TYPES) {
            const el = { type, x: 0, y: 0, w: 120, h: 50, wavelength: 3, steps: 1, duty: 0.2 };
            for (const [x, y] of W.samplePath(el)) {
                ok(Number.isFinite(x) && Number.isFinite(y), `${type} has finite points`);
            }
        }
    });

    /* The original's fallback, kept: an element with no wavelength gets one
       cycle per 100px rather than one cycle total, so a wide wave dragged out
       before the slider is touched looks like a wave and not a single hump. */
    test('a wave with no frequency set gets one cycle per 100px', () => {
        /* Assert the equivalence directly rather than counting crossings in
           the sampled path. Every zero crossing of a default-frequency sine
           lands exactly ON a sample index, so whether a crossing is detected
           comes down to whether sin() returned +1e-16 or -1e-16 there — which
           is how this test first went wrong, reporting 7 crossings for 4
           cycles. Comparing the two paths is exact. */
        const at = (w, wavelength) => W.samplePath({ type: 'sine', x: 0, y: 0, w, h: 100, wavelength });
        eq(at(400, undefined), at(400, 4), '400px with no frequency IS 4 cycles');
        eq(at(250, undefined), at(250, 3), 'and 250px rounds to 3');
        ok(JSON.stringify(at(400, undefined)) !== JSON.stringify(at(400, 1)),
            'and is emphatically not the single flat hump a fallback of 1 would give');
    });

    test('a wave narrower than 100px still gets a whole cycle', () => {
        eq(W.samplePath({ type: 'sine', x: 0, y: 0, w: 40, h: 100 }),
            W.samplePath({ type: 'sine', x: 0, y: 0, w: 40, h: 100, wavelength: 1 }),
            'the fallback floors at 1, never 0');
    });

    test('an unknown type samples to nothing rather than throwing', () => {
        eq(W.samplePath({ type: 'rect', x: 0, y: 0, w: 10, h: 10 }), [], 'empty path');
    });
}
