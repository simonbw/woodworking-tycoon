import { useEffect } from "react";

export function useKeyDown(callback: (event: KeyboardEvent) => void) {
  return useDocumentEvent("keydown", callback);
}

export function useDocumentClick(callback: (event: MouseEvent) => void) {
  return useDocumentEvent("click", callback);
}

export function useDocumentEvent<T extends keyof DocumentEventMap>(
  type: T,
  callback: (event: DocumentEventMap[T]) => void
) {
  useEffect(() => {
    document.addEventListener(type, callback);
    return () => {
      document.removeEventListener(type, callback);
    };
  }, [type, callback]);
}
