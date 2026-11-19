import type {FacetHost, Native, Principal, Registry, Self} from "@earendil-works/chord";
import {defineRegistry} from "@earendil-works/chord";

// Members are JSON, so the class instance an object opens reaches the other objects on its host through a registry.
export type NativeRegistry<T> = Registry<Native<T>, Native<T> | undefined>;

export function nativeRegistry<T>(name: string): NativeRegistry<T> {
  return defineRegistry<Native<T>, Native<T> | undefined>(name, {version: 1});
}

export function serveNative<T, P extends Principal>(host: FacetHost<P>, registry: NativeRegistry<T>): void {
  host.serve(registry, {compose: (table) => table[0]?.value});
}

// Reference the object that opens the instance first (`self.get`): it orders this object's close before the instance's.
export function nativeOf<T>(self: Pick<Self, "registry">, registry: NativeRegistry<T>): () => T {
  const composed = self.registry(registry);

  return () => {
    const native = composed.value;
    if (!native) throw new Error(`${registry.name} is not open.`);
    return native.value;
  };
}
