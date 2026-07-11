import { useEffect, useState, } from 'react';
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs';
import { CodeView } from '@pierre/diffs/react';
import type { CodeViewItem } from '@pierre/diffs';

interface DiffPayload {
  patch: string;
  cwd: string;
}

type DiffStyle = 'split' | 'unified';

function buildItems(files: FileDiffMetadata[]): CodeViewItem[] {
  return files.map((fileDiff) => ({
    id: `diff:${fileDiff.name}`,
    type: 'diff' as const,
    fileDiff,
  }));
}

function computeStats(files: FileDiffMetadata[]) {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    for (const hunk of f.hunks) {
      additions += hunk.additionCount;
      deletions += hunk.deletionCount;
    }
  }
  return { additions, deletions };
}

export default function App() {
  const [cwd, setCwd] = useState<string | null>(null);
  const [files, setFiles] = useState<FileDiffMetadata[]>([]);
  const [items, setItems] = useState<CodeViewItem[]>([]);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const es = new EventSource('/api/watch');
    es.addEventListener('diff', (message: MessageEvent<string>) => {
      console.log("Message received..", message.data, typeof message.data);

      const serializedData: DiffPayload = JSON.parse(message.data)

      if (error) {
        setError("");
      }

      const parsed = parsePatchFiles(serializedData.patch).flatMap((p) => p.files);
      setFiles(parsed);
      setItems(buildItems(parsed));
      setStatus('ready');
      setRefreshKey((prev) => prev + 1);
      if (cwd === null) {
        setCwd(serializedData.cwd)
      }
    });
    es.onerror = () => {
      // Connection dropped — browser will reconnect automatically
      setError("An error occurred while getting diff.");
    };
    return () => es.close();
  }, []);


  const { additions, deletions } = computeStats(files);
  const command = "git diff HEAD"

  if (status === 'loading') {
    return (
      <div className="state-screen">
        <div className="spinner" />
        <h2>Loading diff…</h2>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="state-screen">
        <h2>Failed to load diff</h2>
        <div className="error-box">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-brand">diff-viewer</span>
        <div className="toolbar-sep" />
        <span className="toolbar-meta">
          {cwd ?? ''} — <strong>{command}</strong>
        </span>

        {files.length > 0 && (
          <div className="toolbar-stats">
            <span className="stat-files">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            <span className="stat-additions">+{additions}</span>
            <span className="stat-deletions">−{deletions}</span>
          </div>
        )}

        <div className="toolbar-controls">
          <div className="toggle-btn">
            <button
              className={diffStyle === 'split' ? 'active' : ''}
              onClick={() => setDiffStyle('split')}
            >
              Split
            </button>
            <button
              className={diffStyle === 'unified' ? 'active' : ''}
              onClick={() => setDiffStyle('unified')}
            >
              Unified
            </button>
          </div>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="state-screen main">
          <h2>No changes</h2>
          <p>{command}</p>
        </div>
      ) : (
        <div
          key={refreshKey}
          className={`diff-wrap main`}
        >
          <CodeView
            items={items}
            style={{ height: '100%', overflow: 'auto' }}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              stickyHeaders: true,
              diffStyle,
              hunkSeparators: 'line-info',
              layout: { paddingTop: 16, paddingBottom: 16, gap: 12 },
            }}
          />
        </div>
      )}
    </>
  );
}
