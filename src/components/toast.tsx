import { type Toast as ToastData } from '../lib/use-toast';

export default function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.kind}`}>{toast.text}</div>;
}
