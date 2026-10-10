import { type ReviewEvent } from './models/git';

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json()
  if (!res.ok) {
    const errorMessage = data as { error: string };
    throw new Error(errorMessage.error);
  }

  return data as T;
}

export const stageFile = (path: string) => post('/api/stage', { path });
export const unstageFile = (path: string) => post('/api/unstage', { path });
export const restoreFile = (path: string) => post('/api/restore', { path });
export const commitChanges = (message: string) => post('/api/commit', { message });
export const pushChanges = () => post('/api/push', {});
export const submitReview = (review: { event: ReviewEvent; body: string }) => post('/api/review', review);
export const openInNeovim = (target: { path: string; line: number }) => post('/api/open', target);
