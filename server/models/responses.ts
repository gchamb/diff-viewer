import type { FileStatus } from "../modules/file-handling/git.js";

export type DiffResponse = {
  patch: string;
  cwd: string;
  statuses: FileStatus[];
};
