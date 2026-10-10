import { useCallback, useMemo, useState } from 'react';
import { type FileDiffMetadata } from '@pierre/diffs';

// path -> fingerprint of the file's diff at the moment it was marked viewed.
type ViewedRecord = Record<string, string>;

export type ViewedState = 'viewed' | 'unviewed' | 'changed';

function readRecord(storageKey: string): ViewedRecord {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as ViewedRecord) : {};
  } catch {
    return {};
  }
}

// Cheap, stable hash of everything that makes up a file's diff. If the author
// pushes new changes to a file, its fingerprint changes and the viewed mark no
// longer applies.
function fingerprint(file: FileDiffMetadata): string {
  const source = JSON.stringify([
    file.hunks.map((h) => h.hunkSpecs),
    file.additionLines,
    file.deletionLines,
  ]);

  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// Per-file "viewed" marks for a pull request, kept in localStorage so they
// survive reloads and restarts of the viewer.
export function useViewedFiles(storageKey: string, files: FileDiffMetadata[]) {
  const [record, setRecord] = useState<ViewedRecord>(() => readRecord(storageKey));

  const fingerprints = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) {
      map.set(f.name, fingerprint(f));
    }
    return map;
  }, [files]);

  const stateOf = useCallback((path: string): ViewedState => {
    const marked = record[path];
    if (marked === undefined) return 'unviewed';
    return marked === fingerprints.get(path) ? 'viewed' : 'changed';
  }, [record, fingerprints]);

  const toggle = useCallback((path: string) => {
    setRecord((prev) => {
      const next = { ...prev };
      const current = fingerprints.get(path);
      if (current !== undefined && prev[path] !== current) {
        next[path] = current;
      } else {
        delete next[path];
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage full or disabled; the mark still applies for this session.
      }
      return next;
    });
  }, [storageKey, fingerprints]);

  const viewedCount = files.reduce((n, f) => n + (stateOf(f.name) === 'viewed' ? 1 : 0), 0);

  return { stateOf, toggle, viewedCount };
}
