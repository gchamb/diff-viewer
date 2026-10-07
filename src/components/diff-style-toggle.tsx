import { type DiffStyle } from './diff-pane';

export default function DiffStyleToggle({
  diffStyle,
  onChange,
}: {
  diffStyle: DiffStyle;
  onChange: (style: DiffStyle) => void;
}) {
  return (
    <div className="toggle-btn">
      <button
        className={diffStyle === 'split' ? 'active' : ''}
        onClick={() => onChange('split')}
      >
        Split
      </button>
      <button
        className={diffStyle === 'unified' ? 'active' : ''}
        onClick={() => onChange('unified')}
      >
        Unified
      </button>
    </div>
  );
}
