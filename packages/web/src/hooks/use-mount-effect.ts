import {useEffect} from "react";

/** Runs an effect once on mount for intentional external synchronization. */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
