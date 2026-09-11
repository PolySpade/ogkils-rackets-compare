// Client-side analytics. Provider (Plausible / Cloudflare Web Analytics) is wired in
// Phase 5 (product.md §9, pending §14 confirmation). Until then events are queued on
// window and debug-logged so the tracking contract is real and testable now.

export type AnalyticsEvent =
  | 'buy_click'
  | 'compare_add'
  | 'compare_view'
  | 'finder_complete'
  | 'assistant_intent'
  | 'assistant_fallback';

type Props = Record<string, string | number | boolean | null | undefined>;

interface QueuedEvent {
  event: AnalyticsEvent;
  props: Props;
  t: number;
}

declare global {
  interface Window {
    __ogkilsEvents?: QueuedEvent[];
    __ogkilsBuyInit?: boolean;
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  (window.__ogkilsEvents ||= []).push({ event, props, t: Date.now() });
  if (import.meta.env.DEV) console.debug('[analytics]', event, props);
  // Phase 5: forward to the chosen provider, e.g.
  // window.plausible?.(event, { props });
}

/**
 * One delegated listener for every buy button on the page. Fires `buy_click` before the
 * new-tab navigation, reading the data-* attributes BuyButtons.astro renders (§9).
 */
export function initBuyTracking(): void {
  if (typeof window === 'undefined' || window.__ogkilsBuyInit) return;
  window.__ogkilsBuyInit = true;
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest<HTMLElement>('[data-buy-channel]');
      if (!a) return;
      track('buy_click', {
        racketId: a.getAttribute('data-buy-racket'),
        variant: a.getAttribute('data-buy-variant') || null,
        channel: a.getAttribute('data-buy-channel'),
        placement: a.getAttribute('data-buy-placement'),
      });
    },
    { capture: true },
  );
}
