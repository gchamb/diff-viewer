import { type FileDiffMetadata } from '@pierre/diffs';
import { describeChangeType, fileStats } from '../lib/helpers';
import { type ViewedState } from '../lib/use-viewed-files';

// Flat list of files in a pull request. Unlike the local sidebar there are no
// staged/unstaged groups, so every changed file lives in one list.
export default function PrFileList({
  files,
  selectedPath,
  onSelect,
  viewedState,
  viewedCount,
  onToggleViewed,
}: {
  files: FileDiffMetadata[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  viewedState: (path: string) => ViewedState;
  viewedCount: number;
  onToggleViewed: (path: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="sidebar-group">
      <div className="sidebar-group-header">
        Changed files
        <span className="sidebar-group-count">{viewedCount}/{files.length} viewed</span>
      </div>
      <ul className="sidebar-list">
        {files.map((file) => {
          const { kind, label } = describeChangeType(file.type);
          const { additions, deletions } = fileStats(file);
          const state = viewedState(file.name);
          return (
            <li key={file.name} className="sidebar-item">
              <button
                className={`sidebar-row ${selectedPath === file.name ? 'selected' : ''} ${state === 'viewed' ? 'viewed' : ''}`}
                onClick={() => onSelect(file.name)}
                title={file.name}
              >
                <span className={`badge badge-${kind}`}>{label}</span>
                <span className="sidebar-row-name">{file.name}</span>
                {state === 'changed' && <span className="viewed-changed-dot" title="Changed since you viewed it" />}
                <span className="sidebar-row-stats">
                  {additions > 0 && <span className="stat-additions">+{additions}</span>}
                  {deletions > 0 && <span className="stat-deletions">−{deletions}</span>}
                </span>
              </button>
              <input
                type="checkbox"
                className="viewed-checkbox"
                checked={state === 'viewed'}
                onChange={() => onToggleViewed(file.name)}
                title={state === 'changed' ? 'Changed since you viewed it' : 'Mark as viewed'}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
