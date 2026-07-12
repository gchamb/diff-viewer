import { type FileStatus } from "../lib/models/git";
import { FileDiffMetadata } from "@pierre/diffs";
import { deriveFileUIState, fileStats } from "../lib/helpers";

export default function SidebarGroup({
  title,
  statuses,
  filesByName,
  selectedPath,
  onSelect,
}: {
  title: string;
  statuses: FileStatus[];
  filesByName: Map<string, FileDiffMetadata>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (statuses.length === 0) return null;
  return (
    <div className="sidebar-group">
      <div className="sidebar-group-header">
        {title} <span className="sidebar-group-count">{statuses.length}</span>
      </div>
      <ul className="sidebar-list">
        {statuses.map((s) => {
          const file = filesByName.get(s.path);
          const ui = deriveFileUIState(s, file?.type ?? '');
          const { additions, deletions } = fileStats(file);
          return (
            <li key={s.path}>
              <button
                className={`sidebar-row ${selectedPath === s.path ? 'selected' : ''}`}
                onClick={() => onSelect(s.path)}
                title={s.path}
              >
                <span className={`badge badge-${ui.kind}`}>{ui.label}</span>
                <span className="sidebar-row-name">{s.path}</span>
                <span className="sidebar-row-stats">
                  {additions > 0 && <span className="stat-additions">+{additions}</span>}
                  {deletions > 0 && <span className="stat-deletions">−{deletions}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
