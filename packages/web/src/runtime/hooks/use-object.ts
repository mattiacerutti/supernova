import type {Contract, ParamsOf} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useHost} from "@earendil-works/chord/react";
import {useCallback, useRef, useSyncExternalStore} from "react";
import type {OwnerOf} from "@/runtime/references";
import {asOwner} from "@/runtime/references";

/** Chord's `useHold`, except that `undefined` params hold nothing. */
export function useObject<C extends Contract>(Type: C, params: ParamsOf<C> | undefined): OwnerOf<C> | undefined {
  const host = useHost();
  const key = params === undefined ? undefined : JSON.stringify(params);
  const held = useRef<{readonly key: string; readonly ref: OwnerOf<C>} | undefined>(undefined);

  const subscribe = useCallback(
    (changed: () => void) => {
      if (key === undefined) return () => undefined;
      const ref = host.hold(Type, JSON.parse(key) as ParamsOf<C>, BACKGROUND_CONTEXT);
      const current = {key, ref: asOwner(ref)};
      held.current = current;
      changed();
      return () => {
        if (held.current === current) held.current = undefined;
        ref.release();
      };
    },
    [host, Type, key]
  );
  const read = () => (held.current?.key === key ? held.current?.ref : undefined);
  return useSyncExternalStore(subscribe, read, read);
}
