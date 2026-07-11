import { Request } from "express";

export function validateGitRequest(req: Request): string {
  const filePath = req.body?.path;
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Missing "path" in request body.');
  }
  return filePath;
};

export function validateGitCommitRequest(req: Request): string {
  const message = req.body.message;
  if (typeof message !== "string") {
    throw new Error('Invalid commit message.');
  }
  if (message.trim() === "") {
    throw new Error('Commit message cannot be empty.');
  }

  return message;
};


