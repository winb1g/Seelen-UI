//! [fork] Forwards the mouse wheel to the dock.
//!
//! Windows only delivers `WM_MOUSEWHEEL` to the hovered window if "Scroll inactive windows when hovering
//! over them" is enabled, and the dock is never the focused window. So a low-level mouse hook catches the
//! wheel while the cursor is over a dock window, swallows it (so the focused app doesn't scroll too) and
//! forwards it to that dock webview, where `fork/weg/wheelBridge.ts` replays it as a DOM `wheel` event.
//!
//! Transparent areas of the dock ignore cursor events, so they are skipped by `WindowFromPoint` and the
//! wheel keeps reaching the apps behind them.

use std::sync::{
    OnceLock,
    mpsc::{Sender, channel},
};

use seelen_core::resource::WidgetId;
use tauri::{Emitter, Manager};
use windows::Win32::{
    Foundation::{LPARAM, LRESULT, POINT, WPARAM},
    UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GA_ROOT, GetAncestor, GetMessageW,
        GetWindowThreadProcessId, HC_ACTION, MSG, MSLLHOOKSTRUCT, SetWindowsHookExW,
        TranslateMessage, WH_MOUSE_LL, WM_MOUSEWHEEL, WindowFromPoint,
    },
};

use crate::{
    app::get_app_handle, error::ResultLogExt, utils::spawn_named_thread,
    widgets::webview::WidgetWebviewLabel, windows_api::WindowsApi,
};

const WHEEL_EVENT: &str = "fork::wheel";

/// (webview label, wheel delta) pairs, emitted outside of the hook to keep it as fast as possible
static FORWARDER: OnceLock<Sender<(String, i16)>> = OnceLock::new();

pub fn start() {
    let (sender, receiver) = channel::<(String, i16)>();
    if FORWARDER.set(sender).is_err() {
        return;
    }

    spawn_named_thread("Fork Wheel Forwarder", move || {
        for (label, delta) in receiver {
            get_app_handle()
                .emit_to(label.as_str(), WHEEL_EVENT, delta)
                .log_error();
        }
    });

    // low-level hooks are called on the installing thread, so it needs its own message loop
    spawn_named_thread("Fork Wheel Hook", || {
        let module = WindowsApi::module_handle_w().ok().map(Into::into);
        if let Err(err) = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), module, 0) } {
            log::error!("Failed to install the dock wheel hook: {err}");
            return;
        }

        let mut msg = MSG::default();
        while unsafe { GetMessageW(&mut msg, None, 0, 0) }.as_bool() {
            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    });
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && wparam.0 == WM_MOUSEWHEEL as usize {
        let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
        if let Some(label) = dock_label_at(info.pt) {
            let delta = (info.mouseData >> 16) as u16 as i16;
            if let Some(forwarder) = FORWARDER.get() {
                let _ = forwarder.send((label, delta));
            }
            return LRESULT(1);
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// Raw webview label of the dock window under the point, if any
fn dock_label_at(point: POINT) -> Option<String> {
    let root = unsafe { GetAncestor(WindowFromPoint(point), GA_ROOT) };
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(root, Some(&mut pid)) };
    if root.is_invalid() || pid != std::process::id() {
        return None;
    }

    get_app_handle()
        .webview_windows()
        .into_values()
        .find_map(|window| {
            // SAFETY: HWND in windows 0.61 (tauri) and 0.62 (ours) share the same memory layout
            if window.hwnd().ok()?.0 as isize != root.0 as isize {
                return None;
            }
            let label = WidgetWebviewLabel::try_from_raw(window.label()).ok()?;
            (label.widget_id == WidgetId::known_weg()).then_some(label.raw)
        })
}
