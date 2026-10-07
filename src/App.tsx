import { useEffect, useRef, useState } from 'react';
import { parsePatchFiles, type FileDiffMetadata, type CodeViewItem } from '@pierre/diffs';
import { type DiffPayload } from './lib/models/git';
import { buildItems } from './lib/helpers';
import LocalView from './views/local-view';
import ReviewView from './views/review-view';

// Owns the connection to the server and renders whichever mode the CLI started
// in: local worktree changes, or the pull request for the checked-out branch.
export default function App() {
  const [payload, setPayload] = useState<DiffPayload | null>(null);
  const [files, setFiles] = useState<FileDiffMetadata[]>([]);
  const [items, setItems] = useState<CodeViewItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const version = useRef(0);

  useEffect(() => {
    const es = new EventSource('/api/watch');
    es.addEventListener('diff', (message: MessageEvent<string>) => {
      const data: DiffPayload = JSON.parse(message.data);

      const parsed = parsePatchFiles(data.patch).flatMap((p) => p.files);

      setError('');
      setPayload(data);
      setFiles(parsed);
      // CodeView keys its render cache off `version`, so bump it each event.
      setItems(buildItems(parsed, version.current));
      setStatus('ready');
      version.current = version.current + 1;
    });

    es.onerror = () => {
      setError('An error occurred while getting diff.');
    };
    return () => es.close();
  }, []);

  if (status === 'loading') {
    return (
      <div className="state-screen">
        <div className="spinner" />
        <h2>Loading diff…</h2>
      </div>
    );
  }

  if (status === 'error' || !payload) {
    return (
      <div className="state-screen">
        <h2>Failed to load diff</h2>
        <div className="error-box">{error}</div>
      </div>
    );
  }

  return payload.mode === 'review'
    ? <ReviewView payload={payload} files={files} items={items} />
    : <LocalView payload={payload} files={files} items={items} />;
}
