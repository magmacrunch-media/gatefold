// bridge.js — the app's command catalog over the kit's Tauri substrate.
//
// kit/bridge-core.js decided whether a backend exists; when it did not,
// MagmaKit.tauri is undefined, Gatefold.fs stays undefined too, and that
// absence is the whole feature switch — the pages degrade instead of throwing.
// core/tier.js reads that absence once and turns it into a capability table,
// so nothing downstream asks "are we in Tauri" a second time.
//
// This file is the ONLY place a Rust command is named, and the names here
// match the allowlist in desktop/src-tauri/src/lib.rs exactly. Everything
// here is plumbing; anything the app knows about its own documents lives in
// core/, in JavaScript, where the web build and the desktop build share one
// copy of it and the Node suites can reach it.

(function () {
    'use strict';

    window.Gatefold = window.Gatefold || {};

    const T = window.MagmaKit && window.MagmaKit.tauri;
    if (!T) return;

    T.suppressContextMenu();

    const PROJECT_FILTER = [{ name: 'GATE//FOLD project', extensions: ['gatefold'] }];
    const IMAGE_FILTER = [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }];
    const PNG_FILTER = [{ name: 'PNG image', extensions: ['png'] }];

    window.Gatefold.fs = {
        // ── files ────────────────────────────────────────────
        readText: (path) => T.invoke('read_text', { path }),
        writeText: (path, contents) => T.invoke('write_text', { path, contents }),
        readBytes: (path) => T.invoke('read_bytes', { path }).then((a) => new Uint8Array(a)),
        writeBytes: (path, bytes) => T.invoke('write_bytes', { path, contents: [...bytes] }),

        // ── pickers ──────────────────────────────────────────
        // All three resolve to null when the user cancels; every caller must
        // treat that as "nothing happened", not as an error.
        openProject: () =>
            T.dialog('open', { options: { multiple: false, directory: false, filters: PROJECT_FILTER } }),
        saveProject: (defaultPath) =>
            T.dialog('save', { options: { defaultPath, filters: PROJECT_FILTER } }),
        // No new Rust command and no capability change: dialog:allow-open is
        // already granted and read_bytes is already on the allowlist.
        openImage: () =>
            T.dialog('open', { options: { multiple: false, directory: false, filters: IMAGE_FILTER } }),
        savePng: (defaultPath) =>
            T.dialog('save', { options: { defaultPath, filters: PNG_FILTER } }),

        confirm: (message, title) =>
            T.dialog('ask', { message, title: title || 'GATE//FOLD' }),
        notify: (message, title) =>
            T.dialog('message', { message, title: title || 'GATE//FOLD' }),

        // ── config / lifecycle ───────────────────────────────
        configDir: () => T.invoke('config_dir'),
        appVersion: () => T.invoke('app_version'),
        quit: () => T.invoke('quit'),
        setDirty: (dirty) => T.invoke('set_dirty', { dirty }),

        // ── the log file ─────────────────────────────────────
        // Fire-and-forget: a failure to log must never become a failure to run.
        logLine: (kind, message, detail) =>
            T.invoke('log_line', { kind, message, detail: detail === undefined ? null : String(detail) })
                .catch(() => {}),
        logPath: () => T.invoke('log_path'),
    };
}());
