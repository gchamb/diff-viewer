import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type CodeViewLineSelection, type FileDiffMetadata } from '@pierre/diffs';
import { openInNeovim as openApi } from './api';
import { diskLineForSelection, pathFromItemId, toError } from './helpers';
import { type Toast } from './use-toast';

// Owns the diff's line selection and turns it into "open this spot in Neovim",
// either from the `o` shortcut or from a button. Shared by both viewer modes.
export function useOpenInNeovim({
  filesByName,
  flashToast,
  enabled,
}: {
  filesByName: Map<string, FileDiffMetadata>;
  flashToast: (kind: Toast['kind'], text: string) => void;
  // False while a modal owns the keyboard.
  enabled: boolean;
}) {
  const [selection, setSelection] = useState<CodeViewLineSelection | null>(null);

  const mutation = useMutation({
    mutationFn: openApi,
    onSuccess: (_data, target) => flashToast('info', `Opened ${target.path}:${target.line} in Neovim`),
    onError: (e) => flashToast('error', toError(e)),
  });

  const openFile = useCallback(
    (path: string, line = 1) => mutation.mutate({ path, line }),
    [mutation],
  );

  const selectedTarget = selection && pathFromItemId(selection.id)
    ? {
      path: pathFromItemId(selection.id) as string,
      line: diskLineForSelection(
        filesByName.get(pathFromItemId(selection.id) as string),
        selection.range.start,
        selection.range.side,
      ),
    }
    : null;

  const openSelection = useCallback(() => {
    if (selectedTarget) {
      openFile(selectedTarget.path, selectedTarget.line);
    }
  }, [selectedTarget, openFile]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'o' || event.metaKey || event.ctrlKey || event.altKey) return;

      // Don't steal the key from a text field.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '')) {
        return;
      }

      if (!selectedTarget) return;
      event.preventDefault();
      openFile(selectedTarget.path, selectedTarget.line);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, selectedTarget, openFile]);

  return {
    selection,
    setSelection,
    selectedTarget,
    openFile,
    openSelection,
    isOpening: mutation.isPending,
  };
}
