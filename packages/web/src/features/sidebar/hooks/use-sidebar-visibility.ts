import {useState} from "react";
import {useMountEffect} from "@/lib/use-mount-effect";

const COMPACT_SIDEBAR_MEDIA_QUERY = "(max-width: 767.98px)";

/** Reads the responsive sidebar breakpoint without assuming browser APIs exist during initialization. */
function getCompactSidebarLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY).matches;
}

/** Controls sidebar visibility across split and compact full-width layouts. */
export function useSidebarVisibility() {
  const [compactLayout, setCompactLayout] = useState(getCompactSidebarLayout);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
  const [compactSidebarVisible, setCompactSidebarVisible] = useState(false);

  useMountEffect(() => {
    const mediaQueryList = window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY);

    const syncCompactLayout = (event: MediaQueryList | MediaQueryListEvent): void => {
      setCompactLayout(event.matches);

      if (event.matches) {
        setCompactSidebarVisible(false);
      }
    };

    syncCompactLayout(mediaQueryList);
    mediaQueryList.addEventListener("change", syncCompactLayout);

    return () => {
      mediaQueryList.removeEventListener("change", syncCompactLayout);
    };
  });

  const sidebarVisible = compactLayout ? compactSidebarVisible : desktopSidebarVisible;

  const toggleSidebar = (): void => {
    if (compactLayout) {
      setCompactSidebarVisible((visible) => !visible);
      return;
    }

    setDesktopSidebarVisible((visible) => !visible);
  };

  return {compactLayout, sidebarVisible, toggleSidebar};
}
