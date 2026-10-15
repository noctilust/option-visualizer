import { useSyncExternalStore } from 'react';

/**
 * A value held outside React state. Fast-changing UI values (pan position,
 * slider drafts) live here so only the components that read them re-render.
 */
export interface Store<T> {
  get: () => T;
  set: (update: T | ((current: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (update) => {
      const next = typeof update === 'function' ? (update as (current: T) => T)(value) : update;
      if (equals(next, value)) return;
      value = next;
      listeners.forEach(listener => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
