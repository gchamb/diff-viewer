import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type FileDiffMetadata, type CodeViewItem } from '@pierre/diffs';
import { submitReview as submitReviewApi } from '../lib/api';
import { type ReviewEvent, type ReviewPayload } from '../lib/models/git';
import { describeChangeType, computeStats, firstChangedLine, toError } from '../lib/helpers';
import { useToast } from '../lib/use-toast';
import { useOpenInNeovim } from '../lib/use-open-in-neovim';
import { useViewedFiles } from '../lib/use-viewed-files';
import Modal from '../components/modal';
import PrFileList from '../components/pr-file-list';
import DiffPane, { type DiffStyle } from '../components/diff-pane';
import DiffStyleToggle from '../components/diff-style-toggle';
import Toast from '../components/toast';
import OpenInNeovimBar from '../components/open-in-neovim-bar';

const REVIEW_OPTIONS: { event: ReviewEvent; label: string; hint: string }[] = [
  { event: 'comment', label: 'Comment', hint: 'Leave feedback without approving or requesting changes.' },
  { event: 'approve', label: 'Approve', hint: 'Approve the pull request. A comment is optional.' },
  { event: 'request-changes', label: 'Request changes', hint: 'Block the pull request until the feedback is addressed.' },
];

const DECISION_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  REVIEW_REQUIRED: 'Review required',
};

// The pull request on the checked-out branch. The diff comes from GitHub, so
// nothing here mutates the worktree; the only write is submitting a review.
export default function ReviewView({
  payload,
  files,
  items,
}: {
  payload: ReviewPayload;
  files: FileDiffMetadata[];
  items: CodeViewItem[];
}) {
  const { pullRequest: pr } = payload;

  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>('comment');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewError, setReviewError] = useState('');
  const { toast, flashToast } = useToast();

  const reviewMutation = useMutation({
    mutationFn: submitReviewApi,
    onSuccess: (_data, variables) => {
      const label = REVIEW_OPTIONS.find((o) => o.event === variables.event)?.label ?? 'Review';
      flashToast('info', `${label} submitted on #${pr.number}`);
      setReviewOpen(false);
      setReviewBody('');
      setReviewError('');
    },
    onError: (e) => setReviewError(toError(e)),
  });

  // A force-push or rebase can drop the file the user had pinned.
  useEffect(() => {
    if (selectedPath && !files.some((f) => f.name === selectedPath)) {
      setSelectedPath(null);
    }
  }, [files, selectedPath]);

  const viewed = useViewedFiles(`diff-viewer:viewed:${pr.url}`, files);

  // Viewed files collapse like they do on GitHub, except the one pinned in the
  // sidebar, since clicking it means you want to look at it again. CodeView only
  // re-syncs an item when its `version` changes, so both bits are folded in.
  const displayItems = useMemo(() => items.map((it) => {
    if (it.type !== 'diff') return it;
    const isViewed = viewed.stateOf(it.fileDiff.name) === 'viewed';
    const collapsed = isViewed && it.fileDiff.name !== selectedPath;
    return {
      ...it,
      collapsed,
      version: (it.version ?? 0) * 4 + (isViewed ? 2 : 0) + (collapsed ? 1 : 0),
    };
  }), [items, viewed.stateOf, selectedPath]);

  const itemsByName = useMemo(() => {
    const map = new Map<string, CodeViewItem>();
    for (const it of displayItems) {
      if (it.type === 'diff') {
        map.set(it.fileDiff.name, it);
      }
    }
    return map;
  }, [displayItems]);

  const filesByName = useMemo(() => {
    const map = new Map<string, FileDiffMetadata>();
    for (const f of files) {
      map.set(f.name, f);
    }
    return map;
  }, [files]);

  const neovim = useOpenInNeovim({
    filesByName,
    flashToast,
    enabled: !reviewOpen,
  });

  const visibleItems = selectedPath && itemsByName.has(selectedPath)
    ? [itemsByName.get(selectedPath) as CodeViewItem]
    : displayItems;

  const { additions, deletions } = computeStats(files);
  const decision = DECISION_LABELS[pr.reviewDecision];
  const bodyRequired = reviewEvent !== 'approve';

  const openReview = () => {
    setReviewError('');
    setReviewOpen(true);
  };

  const handleSubmit = () => {
    if (bodyRequired && !reviewBody.trim()) {
      setReviewError('A comment is required for this review type.');
      return;
    }
    setReviewError('');
    reviewMutation.mutate({ event: reviewEvent, body: reviewBody });
  };

  const renderHeaderMetadata = (item: CodeViewItem) => {
    if (item.type !== 'diff') return null;
    const { kind, label } = describeChangeType(item.fileDiff.type);
    const fileDiff = item.fileDiff;
    const state = viewed.stateOf(fileDiff.name);
    return (
      <div className="file-actions">
        <span className={`badge badge-${kind}`}>{label}</span>
        {state === 'changed' && <span className="badge badge-changed">Changed since viewed</span>}
        <div className="file-action-buttons">
          <label className={`chip viewed-toggle ${state === 'viewed' ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={state === 'viewed'}
              onChange={() => viewed.toggle(fileDiff.name)}
            />
            Viewed
          </label>
          <button
            className="chip"
            onClick={() => neovim.openFile(fileDiff.name, firstChangedLine(fileDiff))}
            disabled={neovim.isOpening}
            title="Open this file in Neovim"
          >
            Neovim
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
          <a className="pr-link" href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a>
          {' '}<strong>{pr.title}</strong>
        </span>

        <div className="pr-meta">
          {pr.isDraft && <span className="pr-badge pr-badge-draft">Draft</span>}
          {decision && (
            <span className={`pr-badge pr-badge-${pr.reviewDecision.toLowerCase()}`}>{decision}</span>
          )}
          <span className="pr-branches" title={`${pr.headRefName} → ${pr.baseRefName}`}>
            {pr.author} wants to merge <code>{pr.headRefName}</code> into <code>{pr.baseRefName}</code>
          </span>
        </div>

        {files.length > 0 && (
          <div className="toolbar-stats">
            <span className="stat-files">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            <span className="stat-additions">+{additions}</span>
            <span className="stat-deletions">−{deletions}</span>
          </div>
        )}

        <div className="toolbar-controls">
          <button className="review-btn" onClick={openReview} title="Submit a review on this pull request">
            Review
          </button>
          <DiffStyleToggle diffStyle={diffStyle} onChange={setDiffStyle} />
        </div>
      </div>

      {files.length === 0 ? (
        <div className="state-screen main">
          <h2>No changes</h2>
          <p>#{pr.number} has an empty diff against {pr.baseRefName}.</p>
        </div>
      ) : (
        <div className="content">
          <aside className="sidebar">
            <PrFileList
              files={files}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              viewedState={viewed.stateOf}
              viewedCount={viewed.viewedCount}
              onToggleViewed={viewed.toggle}
            />
            <button
              className={`sidebar-all ${selectedPath === null ? 'selected' : ''}`}
              onClick={() => setSelectedPath(null)}
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

      {reviewOpen && (
        <Modal onClose={() => { if (!reviewMutation.isPending) setReviewOpen(false); }}>
          <h3>Review #{pr.number}</h3>
          <div className="review-options">
            {REVIEW_OPTIONS.map((option) => (
              <label key={option.event} className="review-option">
                <input
                  type="radio"
                  name="review-event"
                  checked={reviewEvent === option.event}
                  onChange={() => setReviewEvent(option.event)}
                  disabled={reviewMutation.isPending}
                />
                <span className="review-option-label">{option.label}</span>
                <span className="review-option-hint">{option.hint}</span>
              </label>
            ))}
          </div>
          <textarea
            className="commit-textarea"
            placeholder={bodyRequired ? 'Your review comment…' : 'Your review comment (optional)…'}
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            rows={5}
            autoFocus
            disabled={reviewMutation.isPending}
          />
          {reviewError && <div className="modal-error">{reviewError}</div>}
          <div className="modal-actions">
            <button className="chip" onClick={() => setReviewOpen(false)} disabled={reviewMutation.isPending}>
              Cancel
            </button>
            <button
              className={`chip ${reviewEvent === 'request-changes' ? 'chip-danger-solid' : 'chip-primary-solid'}`}
              onClick={handleSubmit}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Submitting…' : 'Submit review'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
