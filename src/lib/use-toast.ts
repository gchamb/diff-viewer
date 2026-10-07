import { useCallback, useEffect, useRef, useState } from 'react';

export type Toast = { kind: 'info' | 'error'; text: string };

const TOAST_MS = 3500;

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((kind: Toast['kind'], text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ kind, text });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, flashToast };
}
