import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPixelPageView, trackRoutePixelEvent } from "@/lib/meta-pixel";

/**
 * Fires Meta Pixel `PageView` on every SPA navigation, plus the
 * standard event mapped to the current route in `meta-pixel.ts`.
 *
 * The very first PageView is already fired by the inline script in
 * `index.html`, so we skip it on mount to avoid double-counting.
 */
export default function MetaPixelTracker() {
  const location = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    const path = location.pathname;
    if (isFirst.current) {
      isFirst.current = false;
      // Initial PageView already fired by index.html — only the route
      // event still needs to go for the landing pathname.
      trackRoutePixelEvent(path);
      return;
    }
    trackPixelPageView(path);
    trackRoutePixelEvent(path);
  }, [location.pathname]);

  return null;
}
