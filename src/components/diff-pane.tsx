import { type ReactNode } from 'react';
import { CodeView } from '@pierre/diffs/react';
import { type CodeViewItem, type CodeViewLineSelection } from '@pierre/diffs';

export type DiffStyle = 'split' | 'unified';

export default function DiffPane({
  items,
  diffStyle,
  renderHeaderMetadata,
  onSelectedLinesChange,
}: {
  items: CodeViewItem[];
  diffStyle: DiffStyle;
  renderHeaderMetadata?: (item: CodeViewItem) => ReactNode;
  onSelectedLinesChange?: (selection: CodeViewLineSelection | null) => void;
}) {
  return (
    <main className="diff-wrap main">
      <CodeView
        items={items}
        style={{ height: '100%', overflow: 'auto' }}
        renderHeaderMetadata={renderHeaderMetadata}
        onSelectedLinesChange={onSelectedLinesChange}
        options={{
          theme: { dark: 'pierre-dark', light: 'pierre-light' },
          stickyHeaders: true,
          enableLineSelection: true,
          diffStyle,
          hunkSeparators: 'line-info',
          layout: { paddingTop: 16, paddingBottom: 16, gap: 12 },
        }}
      />
    </main>
  );
}
