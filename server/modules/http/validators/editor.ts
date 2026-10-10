import { Request } from "express";

export function validateOpenRequest(req: Request): { path: string; line: number } {
  const filePath = req.body?.path;
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error('Missing "path" in request body.');
  }

  // Default to the top of the file when no specific line was picked.
  const rawLine = req.body?.line ?? 1;
  if (typeof rawLine !== "number" || !Number.isInteger(rawLine) || rawLine < 1) {
    throw new Error('"line" must be a positive integer.');
  }

  return { path: filePath, line: rawLine };
}
