<script lang="ts">
  import { invoke, SeelenCommand } from "@seelen-ui/lib";
  import { WegMiddleClickAction, WindowAttention, type UserAppWindow } from "@seelen-ui/lib/types";
  import { FileIcon } from "libs/ui/svelte/components/Icon/index.ts";
  import { t } from "../../i18n/index.ts";
  import type { AppOrFileWegItem } from "../../types.ts";
  import { settingsState } from "../../state/settings.svelte.ts";
  import { windowsState, focused } from "../../state/windows.svelte.ts";
  import { getUserApplicationContextMenu, launchItem } from "../../appMenu.ts";
  import { triggerPreviewWidget } from "../../previewWidget.ts";
  import { CssHandled } from "libs/ui/svelte/utils/animations.ts";
  import { getBadge } from "../../state/badge.svelte.ts";
  import Icon from "libs/ui/svelte/components/Icon/Icon.svelte";
  import { getAppAudio, stepAppVolume, toggleAppMute } from "../../state/audio.svelte.ts";

  interface Props {
    item: AppOrFileWegItem;
    windows: UserAppWindow[];
  }

  let { item, windows }: Props = $props();

  const settings = $derived(settingsState.value as any);

  const badge = $derived(getBadge(item, windows));

  const itemLabel = $derived(
    settings?.showWindowTitle && windows.length ? windows[0]!.title : null,
  );
  const isFocused = $derived(windows.some((w) => w.hwnd === focused.value?.hwnd));
  const isFlashing = $derived(windows.some((w) => w.attention === WindowAttention.Flashing));
  const needsAttention = $derived(
    isFlashing || windows.some((w) => w.attention === WindowAttention.Highlighted),
  );

  let itemEl: HTMLDivElement | null = $state(null);

  const audio = $derived(getAppAudio(windows));
  const tooltip = $derived.by(() => {
    if (!audio) return item.displayName;
    const state = audio.muted ? $t("volume.muted") : $t("volume.level", { 0: String(Math.round(audio.volume * 100)) });
    return `${item.displayName} - ${state}`;
  });

  // Scrolling over an app that is playing audio changes the volume of that app only. Apps without audio keep the
  // default behavior (e.g. scrolling an overflowing dock). Registered by hand because it needs `passive: false`.
  const WHEEL_NOTCH = 100;
  let wheelAccumulator = 0;
  $effect(() => {
    const el = itemEl;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const current = getAppAudio(windows);
      if (!current || e.deltaY === 0) return;
      e.preventDefault();

      // touchpads emit many small deltas, a mouse wheel emits one ~100 delta per notch
      wheelAccumulator += e.deltaY;
      const notches = Math.trunc(wheelAccumulator / WHEEL_NOTCH);
      if (notches === 0) return;
      wheelAccumulator -= notches * WHEEL_NOTCH;
      stepAppVolume(current, -notches);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function onClick(e: MouseEvent) {
    if (e.ctrlKey && audio) {
      toggleAppMute(audio);
      return;
    }

    if (windows.length > 1) {
      triggerPreviewWidget(itemEl!, windows);
      return;
    }

    const win = windows[0];
    if (!win) {
      launchItem(item, false);
    } else {
      invoke(SeelenCommand.WegToggleWindowState, {
        hwnd: win.hwnd,
        wasFocused: windowsState.delayedFocused?.hwnd === win.hwnd,
      });
    }
  }

  function onAuxClick(e: MouseEvent) {
    if (e.button !== 1) return;
    if (settings?.middleClickAction === WegMiddleClickAction.OpenNewInstance) {
      launchItem(item, false);
    } else {
      const win = windows[0];
      if (win) invoke(SeelenCommand.WegCloseApp, { hwnd: win.hwnd });
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.stopPropagation();
    const alignX = settingsState.popupAlignX;
    const alignY = settingsState.popupAlignY;
    invoke(SeelenCommand.TriggerContextMenu, {
      menu: { ...getUserApplicationContextMenu($t, item, windows), alignX, alignY },
      forwardTo: null,
    });
  }
</script>

<div bind:this={itemEl} role="menu" tabindex="0" class="weg-item-overlay">
  <div
    role="menuitem"
    tabindex="0"
    class="weg-item"
    data-tooltip={tooltip}
    data-tooltip-origin-y={settingsState.tooltipOrigin.y}
    data-tooltip-origin-x={settingsState.tooltipOrigin.x}
    data-tooltip-align-x={settingsState.popupAlignX}
    data-tooltip-align-y={settingsState.popupAlignY}
    onclick={onClick}
    onauxclick={onAuxClick}
    oncontextmenu={onContextMenu}
    onkeypress={() => {}}
  >
    <FileIcon class="weg-item-icon" path={item.relaunch?.icon || item.path} umid={item.umid} />
    {#if itemLabel}
      <div class="weg-item-title">{itemLabel}</div>
    {/if}

    {#if needsAttention}
      <div
        class="weg-item-attention-indicator"
        class:weg-item-attention-indicator-flashing={isFlashing}
      ></div>
    {/if}
  </div>

  {#if badge}
    <div class="weg-item-badge" transition:CssHandled>
      {#if badge.type === "count"}
        {badge.count}
      {:else if badge.type === "color"}
        <div class="weg-item-badge-color" style:background-color={badge.color}></div>
      {:else if badge.type === "icon"}
        <Icon name={badge.name} />
      {:else if badge.type === "image"}
        <img src={badge.src} alt="" />
      {/if}
    </div>
  {/if}

  {#if settings?.showInstanceCounter && windows.length > 1}
    <div class="weg-item-instance-counter-badge" transition:CssHandled>
      {windows.length}
    </div>
  {/if}

  {#if !settings?.showWindowTitle}
    <div
      class="weg-item-open-sign"
      class:weg-item-open-sign-active={windows.length > 0}
      class:weg-item-open-sign-focused={isFocused}
      class:weg-item-open-sign-attention={needsAttention}
    ></div>
  {/if}
</div>

<style>
  .weg-item-badge-color {
    width: 100%;
    height: 100%;
  }
</style>
