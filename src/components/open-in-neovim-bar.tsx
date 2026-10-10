// Appears once a diff line is selected, offering to jump to that spot in Neovim.
export default function OpenInNeovimBar({
  target,
  isOpening,
  onOpen,
}: {
  target: { path: string; line: number } | null;
  isOpening: boolean;
  onOpen: () => void;
}) {
  if (!target) return null;
  return (
    <div className="nvim-bar">
      <span className="nvim-bar-target" title={target.path}>
        {target.path}:{target.line}
      </span>
      <button className="chip chip-primary-solid" onClick={onOpen} disabled={isOpening}>
        {isOpening ? 'Opening…' : 'Open in Neovim'}
      </button>
      <kbd className="nvim-bar-key">o</kbd>
    </div>
  );
}
