/**
 * [fork] Replays the mouse wheel forwarded by the backend (`fork/background/wheel_bridge.rs`).
 *
 * Windows doesn't deliver the wheel to the dock unless "Scroll inactive windows when hovering over them" is
 * enabled, so the backend captures it and here it's dispatched as a regular DOM `wheel` event on the hovered
 * element. Dock code can then just listen to `wheel` as usual.
 */
import { Widget } from "@seelen-ui/lib";

// one wheel notch is 120 on Win32 and 100px on the DOM, positive Win32 deltas mean scrolling up
const WIN32_WHEEL_DELTA = 120;
const DOM_WHEEL_DELTA = 100;

Widget.getCurrent()
  .window.listen<number>("fork::wheel", ({ payload: delta }) => {
    const hovered = document.querySelectorAll(":hover");
    hovered[hovered.length - 1]?.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: (-delta / WIN32_WHEEL_DELTA) * DOM_WHEEL_DELTA,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      }),
    );
  })
  .catch(console.error);
