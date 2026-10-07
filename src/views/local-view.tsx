import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type FileDiffMetadata, type CodeViewItem } from '@pierre/diffs';
import {
  commitChanges as commitApi,
  pushChanges as pushApi,
  restoreFile as restoreApi,
  stageFile as stageApi,
  unstageFile as unstageApi,
} from '../lib/api';
import { type FileStatus, type LocalPayload } from '../lib/models/git';
import { deriveFileUIState, computeStats, firstChangedLine, toError } from '../lib/helpers';
import { useToast } from '../lib/use-toast';
import { useOpenInNeovim } from '../lib/use-open-in-neovim';
import Modal from '../components/modal';
import SidebarGroup from '../components/side-bar-group';
import DiffPane, { type DiffStyle } from '../components/diff-pane';
import DiffStyleToggle from '../components/diff-style-toggle';
import Toast from '../components/toast';
import OpenInNeovimBar from '../components/open-in-neovim-bar';

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}

// Uncommitted local changes, with staging, committing, and pushing.
export default function LocalView({
  payload,
  files,
  items,
}: {
  payload: LocalPayload;
  files: FileDiffMetadata[];
  items: CodeViewItem[];
}) {
  const { cwd, statuses, ahead } = payload;

  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitError, setCommitError] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { toast, flashToast } = useToast();

  const stageMutation = useMutation({
    mutationFn: stageApi,
    onError: (e) => flashToast('error', toError(e)),
  });
  const unstageMutation = useMutation({
    mutationFn: unstageApi,
    onError: (e) => flashToast('error', toError(e)),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreApi,
    onError: (e) => flashToast('error', toError(e)),
  });
  const commitMutation = useMutation({
    mutationFn: commitApi,
    onSuccess: () => {
      flashToast('info', commitMessage);
      setCommitOpen(false);
      setCommitMessage('');
      setCommitError('');
    },
    onError: (e) => setCommitError(toError(e)),
  });
  const pushMutation = useMutation({
    mutationFn: pushApi,
    onSuccess: () => flashToast('info', 'Pushed commits'),
    onError: (e) => flashToast('error', toError(e)),
  });

  // Fall back to the full diff when the selected file stops having changes
  // (committed, restored, or staged away).
  useEffect(() => {
    if (selectedPath && !statuses.some((s) => s.path === selectedPath)) {
      setSelectedPath(null);
    }
  }, [statuses, selectedPath]);

  const statusesByPath = useMemo(() => {
    const map = new Map<string, FileStatus>();
    for (const s of statuses) {
      map.set(s.path, s);
    }
    return map;
  }, [statuses]);

  const filesByName = useMemo(() => {
    const map = new Map<string, FileDiffMetadata>();
    for (const f of files) {
      map.set(f.name, f)
    }
    return map;
  }, [files]);

  const itemsByName = useMemo(() => {
    const map = new Map<string, CodeViewItem>();
    for (const it of items) {
      if (it.type === 'diff') {
        map.set(it.fileDiff.name, it);
      }
    }
    return map;
  }, [items]);

  const stagedStatuses = useMemo(
    () => statuses.filter((s) => s.index !== ' ' && s.index !== '?'),
    [statuses],
  );
  const unstagedStatuses = useMemo(
    () => statuses.filter((s) => s.worktree !== ' '),
    [statuses],
  );
  const stagedCount = stagedStatuses.length;

  const neovim = useOpenInNeovim({
    filesByName,
    flashToast,
    enabled: !commitOpen && !confirm,
  });

  const visibleItems = selectedPath && itemsByName.has(selectedPath)
    ? [itemsByName.get(selectedPath) as CodeViewItem]
    : items;

  const { additions, deletions } = computeStats(files);

  const selectFile = (path: string | null) => setSelectedPath(path);
  const handleStage = (path: string) => stageMutation.mutate(path);
  const handleUnstage = (path: string) => unstageMutation.mutate(path);
  const handleRestore = (path: string, destructive: boolean) => {
    const message = destructive
      ? `This file has no committed version. Restoring will permanently delete "${path}" from disk.`
      : `Restoring "${path}" will discard all uncommitted changes (staged and unstaged) and revert it to the latest commit.`;
    setConfirm({
      title: destructive ? `Delete ${path}?` : `Restore ${path}?`,
      message,
      confirmLabel: destructive ? 'Delete file' : 'Restore',
      danger: true,
      onConfirm: () => {
        setConfirm(null);
        restoreMutation.mutate(path, {
          onSuccess: () => flashToast('info', destructive ? `Deleted ${path}` : `Restored ${path}`),
        });
      },
    });
  };
  const handleCommit = () => {
    if (!commitMessage.trim()) {
      setCommitError('Commit message cannot be empty.');
      return;
    }
    setCommitError('');
    commitMutation.mutate(commitMessage);
  };

  const renderHeaderMetadata = (item: CodeViewItem) => {
    if (item.type !== 'diff') return null;
    const fileDiff = item.fileDiff;
    const state = deriveFileUIState(statusesByPath.get(fileDiff.name), fileDiff.type);
    return (
      <div className="file-actions">
        <span className={`badge badge-${state.kind}`}>
          {state.label}
          {state.staged && <span className="badge-staged-dot" title="Staged" />}
        </span>
        <div className="file-action-buttons">
          {state.canStage && (
            <button
              className="chip"
              onClick={() => handleStage(fileDiff.name)}
              disabled={stageMutation.isPending && stageMutation.variables === fileDiff.name}
              title="Stage this file"
            >
              Stage
            </button>
          )}
          {state.canUnstage && (
            <button
              className="chip"
              onClick={() => handleUnstage(fileDiff.name)}
              disabled={unstageMutation.isPending && unstageMutation.variables === fileDiff.name}
              title="Unstage this file"
            >
              Unstage
            </button>
          )}
          <button
            className="chip"
            onClick={() => neovim.openFile(fileDiff.name, firstChangedLine(fileDiff))}
            disabled={neovim.isOpening}
            title="Open this file in Neovim"
          >
            Neovim
          </button>
          <button
            className="chip chip-danger"
            onClick={() => handleRestore(fileDiff.name, state.destructiveRestore)}
            disabled={restoreMutation.isPending && restoreMutation.variables === fileDiff.name}
            title="Revert this file to the latest commit"
          >
            Restore
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-brand">diff-viewer</span>
        <div className="toolbar-sep" />
        <span className="toolbar-meta">
          {cwd} — <strong>Git diff HEAD</strong>
        </span>

        {files.length > 0 && (
          <div className="toolbar-stats">
            <span className="stat-files">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            <span className="stat-additions">+{additions}</span>
            <span className="stat-deletions">−{deletions}</span>
          </div>
        )}

        <div className="toolbar-controls">
          <button
            className="commit-btn"
            onClick={() => { setCommitError(''); setCommitOpen(true); }}
            disabled={stagedCount === 0}
            title={stagedCount === 0 ? 'Stage files to commit' : `Commit ${stagedCount} staged file${stagedCount !== 1 ? 's' : ''}`}
          >
            Commit{stagedCount > 0 ? ` (${stagedCount})` : ''}
          </button>
          {ahead > 0 && (
            <button
              className="push-btn"
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
              title={`Push ${ahead} commit${ahead !== 1 ? 's' : ''} to upstream`}
            >
              {pushMutation.isPending ? 'Pushing…' : `Push (${ahead})`}
            </button>
          )}
          <DiffStyleToggle diffStyle={diffStyle} onChange={setDiffStyle} />
        </div>
      </div>

      {files.length === 0 ? (
        <div className="state-screen main">
          <h2>No changes</h2>
          <p>Git diff HEAD</p>
        </div>
      ) : (
        <div className="content">
          <aside className="sidebar">
            <SidebarGroup
              title="Staged"
              statuses={stagedStatuses}
              filesByName={filesByName}
              selectedPath={selectedPath}
              onSelect={selectFile}
            />
            <SidebarGroup
              title="Unstaged"
              statuses={unstagedStatuses}
              filesByName={filesByName}
              selectedPath={selectedPath}
              onSelect={selectFile}
            />
            <button
              className={`sidebar-all ${selectedPath === null ? 'selected' : ''}`}
              onClick={() => selectFile(null)}
            >
              All files
            </button>
          </aside>

          <DiffPane
            items={visibleItems}
            diffStyle={diffStyle}
            renderHeaderMetadata={renderHeaderMetadata}
            onSelectedLinesChange={neovim.setSelection}
          />
        </div>
      )}

      <OpenInNeovimBar
        target={neovim.selectedTarget}
        isOpening={neovim.isOpening}
        onOpen={neovim.openSelection}
      />

      <Toast toast={toast} />

      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <h3>{confirm.title}</h3>
          <p className="modal-text">{confirm.message}</p>
          <div className="modal-actions">
            <button className="chip" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className={`chip ${confirm.danger ? 'chip-danger-solid' : 'chip-primary-solid'}`}
              onClick={confirm.onConfirm}
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </Modal>
      )}

      {commitOpen && (
        <Modal onClose={() => { if (!commitMutation.isPending) setCommitOpen(false); }}>
          <h3>Commit staged changes</h3>
          <p className="modal-text">
            {stagedCount > 0
              ? `This will commit ${stagedCount} staged file${stagedCount !== 1 ? 's' : ''} with the message below.`
              : 'Nothing is staged. Use the Stage button on a file first.'}
          </p>
          <textarea
            className="commit-textarea"
            placeholder="Commit message…"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={4}
            autoFocus
            disabled={commitMutation.isPending}
          />
          {commitError && <div className="modal-error">{commitError}</div>}
          <div className="modal-actions">
            <button className="chip" onClick={() => setCommitOpen(false)} disabled={commitMutation.isPending}>Cancel</button>
            <button
              className="chip chip-primary-solid"
              onClick={handleCommit}
              disabled={commitMutation.isPending || stagedCount === 0}
            >
              {commitMutation.isPending ? 'Committing…' : 'Commit'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
