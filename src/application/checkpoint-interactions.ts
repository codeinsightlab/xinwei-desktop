import { onMounted, onUnmounted, ref, watch } from 'vue';
import { desktop } from '../platform/desktop';
import { clock } from './clock';
import { CheckpointObserver, CHECKPOINT_TTL_MS, type CheckpointKind } from '../domain/checkpoints';
import type { EngagementDay, Receipt } from '../domain/engagement-money';

interface Options {
  day: () => EngagementDay | undefined;
  enabled: () => boolean;
  blocked: () => boolean;
  claim: (kind: CheckpointKind) => Promise<Receipt | undefined>;
}

/** Window-local delivery; persistent deduplication belongs to the normal Store
 * transaction. Visibility queries are read-only, bounded to one poll/second,
 * only while active/enabled, plus one check after a successful claim. */
export function useCheckpointInteractions(options: Options) {
  const message = ref<Receipt>();
  const observer = new CheckpointObserver();
  let interval: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let stopVisibility: (() => void) | undefined;
  let disposed = false, checking = false, generation = 0, reportedVisibilityError = false;
  let lastActivityAt = -Infinity;

  function dismiss() {
    message.value = undefined;
    clearTimeout(expiry);
  }
  function suspend() { generation++; observer.reset(); dismiss(); }
  function userActivity(event: Event) {
    lastActivityAt = clock.now();
    if (!(event.target instanceof Element && event.target.closest('.checkpoint-card'))) dismiss();
  }
  function available() {
    return !disposed && options.enabled() && !options.blocked()
      && !document.hidden && clock.now() - lastActivityAt >= 30_000;
  }

  async function poll() {
    if (disposed || checking) return;
    checking = true;
    const observedGeneration = generation;
    try {
      const visible = options.enabled() && !document.hidden && await desktop.isWidgetVisible();
      if (disposed || observedGeneration !== generation) return;
      const kind = observer.observe(options.day(), clock.now(), visible);
      if (!visible) { dismiss(); return; }
      if (!kind || !available()) return;
      const event = await options.claim(kind);
      // No show/focus/unminimize operation is allowed here. Recheck after I/O
      // so hiding or disabling feedback during the commit cannot show a card.
      if (!event || observedGeneration !== generation || !available()) return;
      if (!await desktop.isWidgetVisible() || observedGeneration !== generation || !available()) return;
      if (event.shownAt === undefined || clock.now() - event.shownAt > 5_000) return;
      message.value = event;
      clearTimeout(expiry);
      expiry = setTimeout(dismiss, CHECKPOINT_TTL_MS);
    } catch (error) {
      suspend();
      if (!reportedVisibilityError) {
        console.warn('时间互动已跳过：无法确认悬浮窗可见状态', error);
        reportedVisibilityError = true;
      }
    } finally { checking = false; }
  }

  watch(options.enabled, suspend);
  watch(() => options.day()?.snapshot.intervals.map(i=>`${i.start}:${i.end}`).join(','), suspend);
  watch(options.blocked, blocked => { if (blocked) dismiss(); });
  onMounted(() => {
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pointerdown', userActivity, true);
    window.addEventListener('keydown', userActivity, true);
    interval = setInterval(() => { void poll(); }, 1_000);
    void poll();
    void desktop.on<boolean>('widget-visibility-changed', suspend).then(stop => {
      if (disposed) stop(); else stopVisibility = stop;
    }).catch(error => console.warn('无法监听小窗可见状态，时间互动将使用可见性轮询', error));
  });
  onUnmounted(() => {
    disposed = true;
    suspend();
    clearInterval(interval);
    stopVisibility?.();
    document.removeEventListener('visibilitychange', suspend);
    window.removeEventListener('pointerdown', userActivity, true);
    window.removeEventListener('keydown', userActivity, true);
  });
  return { message, dismiss };
}
