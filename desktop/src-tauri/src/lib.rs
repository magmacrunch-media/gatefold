//! GATE//FOLD desktop shell.
//!
//! Thin on purpose. The window loads the same HTML, CSS and JavaScript a
//! browser would; this crate adds the things a browser tab cannot give it —
//! real Open/Save dialogs, real file writes, a log file on disk — and nothing
//! else. Everything the app knows about its own documents lives in app/core/,
//! in JavaScript, where it is testable in Node.
//!
//! The behavior of the commands below is magma_kit's; what this file owns is
//! the ALLOWLIST — one named command per thing the frontend may do.

use std::sync::Mutex;

use magma_kit::dirty::Dirty;
use tauri::Manager;

/// The log file's path, resolved once at startup.
struct LogReady(Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Dirty::new())
        .manage(LogReady(Mutex::new(None)))
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&dir)?;
            let path = magma_kit::log::init(&dir, "gatefold.log");
            *app.state::<LogReady>().0.lock().unwrap() = Some(path.display().to_string());
            magma_kit::log::rs("boot", "app starting");
            Ok(())
        })
        .on_window_event(|window, event| {
            let tauri::WindowEvent::CloseRequested { api, .. } = event else { return };
            magma_kit::dirty::confirm_close(
                window,
                api,
                &window.state::<Dirty>(),
                "This project has unsaved changes. Close anyway?",
                "GATE//FOLD",
            );
        });

    /* macOS ONLY, and the cfg is load-bearing rather than tidiness.
       `Builder::menu` sets the menu for every window, and on Windows and Linux
       that menu is painted INSIDE the window — directly above the app's own
       menu bar, which is the same duplication moved somewhere worse. macOS is
       the only platform with a global bar and the only one that needs this.
       The attribute cannot go mid-chain because Builder::menu is itself
       cfg(desktop), so the builder is bound and shadowed. */
    #[cfg(target_os = "macos")]
    let builder = builder.menu(mac_menu);

    builder
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            read_bytes,
            write_bytes,
            config_dir,
            app_version,
            log_line,
            log_path,
            set_dirty,
            quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GATE//FOLD");
}

/// The smallest application menu that still behaves like a Mac app.
///
/// With no menu set, Tauri installs `Menu::default()` on macOS — App, File,
/// Edit, View, Window, Help — and this app already draws File/Edit/View/Help
/// in the page, so every one of them appears twice.
///
/// macOS always shows the application submenu, so the only question is what
/// sits beside it, and the answer here is nothing.
///
/// THE EDIT ITEMS LIVE INSIDE THE APP SUBMENU, deliberately. An empty menu is
/// the obvious fix and it is wrong: Cmd+Q and Cmd+C/V/X/A in a WKWebView text
/// field are key equivalents attached TO menu items, not app-level defaults,
/// so removing the menu would stop the text dialog taking pasted input.
/// macOS looks through the whole main menu for key equivalents regardless of
/// which submenu holds them — so folding them in here keeps every shortcut
/// working while leaving the menu bar showing one item instead of six.
#[cfg(target_os = "macos")]
fn mac_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder};

    // The title is ignored: macOS labels the first submenu with the bundle
    // name whatever is passed here.
    let app_menu = SubmenuBuilder::new(app, "GATE//FOLD")
        .about(None)
        .separator()
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .separator()
        .quit()
        .build()?;

    MenuBuilder::new(app).items(&[&app_menu]).build()
}

// ── files ───────────────────────────────────────────────
//
// Three-line wrappers over magma_kit::fs. The kit owns the behavior (including
// the path-containment check inside write_in_root); this list is the surface.

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    magma_kit::fs::read_text(&path)
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    magma_kit::fs::write_text(&path, &contents)
}

#[tauri::command]
fn read_bytes(path: String) -> Result<Vec<u8>, String> {
    magma_kit::fs::read_bytes(&path)
}

#[tauri::command]
fn write_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    magma_kit::fs::write_bytes(&path, &contents)
}

// ── config, version, lifecycle ──────────────────────────

/// The OS config directory, never the repo: per-machine configuration is why
/// this app can know about its author's setup while a stranger's copy knows
/// about theirs.
#[tauri::command]
fn config_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir.display().to_string())
}

/// Cargo.toml is the one source of truth for the version; the footer asks for
/// it rather than hardcoding one that would be wrong forever after.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// The webview's side of the log file — kit/boot.js reports crashes here.
#[tauri::command]
fn log_line(kind: String, message: String, detail: Option<String>) {
    magma_kit::log::write("JS", &kind, &message, detail.as_deref());
}

#[tauri::command]
fn log_path(state: tauri::State<LogReady>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Pushed rather than asked for: only the frontend knows whether anything is
/// unsaved, and only this side is told the window is closing.
#[tauri::command]
fn set_dirty(state: tauri::State<Dirty>, dirty: bool) {
    state.set(dirty);
}

/// File > Exit.
///
/// A named command rather than granting core:window:allow-close, for the same
/// reason the file operations above are commands rather than the filesystem
/// plugin: one function the frontend can call is a smaller surface than a
/// capability that lets any script close the window.
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}
