// core/palette.js — colour values, and nothing that draws with them.
//
// Extracted from three places in the web tool that each did the same job
// slightly differently: isValidHex in app.js, the auto-prefix regex repeated
// four times inside syncColorPair, and rgbToHex inside color.js's eyedropper.
// One implementation, tested, so the hex field, the picker and the eyedropper
// cannot disagree about what a colour is.
//
// Pure: no DOM, no canvas. The eyedropper's getImageData stays in
// ui/reference.js, which is where the pixels are; what comes back here is
// three numbers.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* 'none' is a real value in the element model — it is what a shape with
       its fill or stroke switched off carries, and ui/render.js checks for it
       before deciding whether to fill at all. It is deliberately NOT a valid
       hex: normalize() must not turn it into a colour. */
    const NONE = 'none';

    const HEX = /^#[0-9a-f]{6}$/i;
    const BARE = /^[0-9a-f]{6}$/i;

    function isValidHex(value) {
        return HEX.test(String(value));
    }

    /**
     * What the hex field means by what was typed into it.
     *
     * Returns a normalised '#rrggbb', or null when the input is not a colour.
     * Null is the "leave the value alone" answer every caller already wants:
     * the field is edited a character at a time, so most keystrokes are not
     * yet a colour and must not be treated as an error.
     *
     * The auto-prefix is why this exists rather than a bare regex test. People
     * paste 'ff3d6e' out of a palette far more often than '#ff3d6e', and the
     * web tool handled that in four separate places, which is four places for
     * it to be handled differently.
     */
    function normalizeHex(value) {
        if (value === NONE) return NONE;
        let v = String(value == null ? '' : value).trim();
        if (BARE.test(v)) v = '#' + v;
        if (!isValidHex(v)) return null;
        return v.toLowerCase();
    }

    /**
     * Three channel bytes to '#rrggbb'.
     *
     * padStart is load-bearing: without it a dark pixel becomes '#000' rather
     * than '#000000', which is a valid CSS colour and an invalid value for
     * <input type="color">, so the picker would silently snap to black while
     * the hex field showed something else.
     */
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b]
            .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
            .join('');
    }

    App.palette = {
        NONE: NONE,
        isValidHex: isValidHex,
        normalizeHex: normalizeHex,
        rgbToHex: rgbToHex,
    };
}());
