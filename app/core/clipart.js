// core/clipart.js — the icon library, as DATA.
//
// Twenty-seven icons from Lucide (ISC), each defined in a 24x24 viewBox as
// some combination of SVG path strings, circles, lines, rects and points.
//
// The web tool kept drawClipart() in here too, which made the whole library
// unreachable from a Node suite for the sake of one function that needs a
// canvas. The drawing moved to ui/render.js, where the rest of the drawing
// is; what is left is a table and three accessors, so the shapes popup and
// the layers panel can both read it without a DOM.
//
// Lucide, ISC License. https://lucide.dev — see LICENSES.md.
//
// Pure: no DOM, no canvas.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* Each icon: { label, paths: [d], circles: [[cx,cy,r]], lines:
       [[x1,y1,x2,y2]], rects: [[x,y,w,h,r]], points: [[x,y]] }. All in a
       24x24 viewBox; ui/render.js scales and centres them into the element
       box. */
    const ICONS = {
        // ── MUSIC / AUDIO ──
        music: {
            label: 'MUSIC',
            paths: ['M9 18V5l12-2v13'],
            circles: [[6, 18, 3], [18, 16, 3]],
        },
        'music-2': {
            label: 'MUSIC 2',
            circles: [[8, 18, 4]],
            paths: ['M12 18V2l7 4'],
        },
        headphones: {
            label: 'HEADPHONES',
            paths: ['M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3'],
        },
        disc: {
            label: 'DISC',
            circles: [[12, 12, 10], [12, 12, 2]],
        },
        radio: {
            label: 'RADIO',
            paths: [
                'M16.247 7.761a6 6 0 0 1 0 8.478',
                'M19.075 4.933a10 10 0 0 1 0 14.134',
                'M4.925 19.067a10 10 0 0 1 0-14.134',
                'M7.753 16.239a6 6 0 0 1 0-8.478',
            ],
            circles: [[12, 12, 2]],
        },
        speaker: {
            label: 'SPEAKER',
            rects: [[4, 2, 16, 20, 2]],
            circles: [[12, 14, 4]],
            points: [[12, 6]],
        },
        podcast: {
            label: 'PODCAST',
            paths: [
                'M13 17a1 1 0 1 0-2 0l.5 4.5a0.5 0.5 0 0 0 1 0z',
                'M16.85 18.58a9 9 0 1 0-9.7 0',
                'M8 14a5 5 0 1 1 8 0',
            ],
            circles: [[12, 11, 1]],
        },

        // ── RETRO / PUNK ──
        skull: {
            label: 'SKULL',
            paths: [
                'm12.5 17-.5-1-.5 1h1z',
                'M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z',
            ],
            circles: [[15, 12, 1], [9, 12, 1]],
        },
        zap: {
            label: 'ZAP',
            paths: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'],
        },
        flame: {
            label: 'FLAME',
            paths: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'],
        },
        crown: {
            label: 'CROWN',
            paths: [
                'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
                'M5 21h14',
            ],
        },
        swords: {
            label: 'SWORDS',
            paths: [
                'M14.5 17.5L3 6 3 3 6 3 17.5 14.5',
                'M13 19l6-6',
                'M16 16l4 4',
                'M19 21l2-2',
                'M14.5 6.5L18 3 21 3 21 6 17.5 9.5',
                'M5 14l4 4',
                'M7 17l-3 3',
                'M3 19l2-2',
            ],
        },
        sparkles: {
            label: 'SPARKLES',
            paths: [
                'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
                'M20 2v4',
                'M22 4h-4',
            ],
            circles: [[4, 20, 2]],
        },

        // ── SPACE / SCI-FI ──
        rocket: {
            label: 'ROCKET',
            paths: [
                'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
                'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09',
                'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z',
                'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05',
            ],
        },
        satellite: {
            label: 'SATELLITE',
            paths: [
                'm13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5',
                'M16.5 7.5 19 5',
                'm17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5',
                'M9 21a6 6 0 0 0-6-6',
                'M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z',
            ],
        },
        crosshair: {
            label: 'CROSSHAIR',
            circles: [[12, 12, 10]],
            lines: [[22, 12, 18, 12], [6, 12, 2, 12], [12, 6, 12, 2], [12, 22, 12, 18]],
        },
        moon: {
            label: 'MOON',
            paths: ['M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'],
        },
        antenna: {
            label: 'ANTENNA',
            paths: [
                'M2 12 7 2',
                'm7 12 5-10',
                'm12 12 5-10',
                'm17 12 5-10',
                'M4.5 7h15',
                'M12 16v6',
            ],
        },

        // ── ARCADE / GAMING ──
        ghost: {
            label: 'GHOST',
            paths: [
                'M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z',
                'M9 10h.01',
                'M15 10h.01',
            ],
        },
        'gamepad-2': {
            label: 'GAMEPAD',
            lines: [[6, 11, 10, 11], [8, 9, 8, 13], [15, 12, 15.01, 12], [18, 10, 18.01, 10]],
            paths: ['M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z'],
        },
        'dice-5': {
            label: 'DICE 5',
            rects: [[3, 3, 18, 18, 2]],
            circles: [[16, 8, 1.5], [8, 8, 1.5], [8, 16, 1.5], [16, 16, 1.5], [12, 12, 1.5]],
        },

        // ── GENERAL / DESIGN ──
        star: {
            label: 'STAR',
            paths: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
        },
        heart: {
            label: 'HEART',
            paths: ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'],
        },
        eye: {
            label: 'EYE',
            paths: ['M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'],
            circles: [[12, 12, 3]],
        },
        shield: {
            label: 'SHIELD',
            paths: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
        },
        trophy: {
            label: 'TROPHY',
            paths: [
                'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
                'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
                'M18 9h1.5a1 1 0 0 0 0-5H18',
                'M4 22h16',
                'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
                'M6 9H4.5a1 1 0 0 1 0-5H6',
            ],
        },
        sun: {
            label: 'SUN',
            circles: [[12, 12, 4]],
            lines: [[12, 2, 12, 4], [12, 20, 12, 22], [2, 12, 4, 12], [20, 12, 22, 12]],
            paths: [
                'm4.93 4.93 1.41 1.41',
                'm17.66 17.66 1.41 1.41',
                'm6.34 17.66-1.41 1.41',
                'm19.07 4.93-1.41 1.41',
            ],
        },
    };

    function getIconIds() { return Object.keys(ICONS); }
    function getIcon(id) { return ICONS[id] || null; }
    function getIconLabel(id) { return ICONS[id] ? ICONS[id].label : id; }

    App.clipart = {
        ICONS: ICONS,
        VIEWBOX: 24,
        getIconIds: getIconIds,
        getIcon: getIcon,
        getIconLabel: getIconLabel,
    };
}());
