import { Request } from "express";
import type { ReviewEvent } from "../../../models/responses.js";

const REVIEW_EVENTS: ReviewEvent[] = ["approve", "request-changes", "comment"];

export function validateReviewRequest(req: Request): { event: ReviewEvent; body: string } {
  const event = req.body?.event;
  if (!REVIEW_EVENTS.includes(event)) {
    throw new Error(`Review event must be one of: ${REVIEW_EVENTS.join(", ")}.`);
  }

  const rawBody = req.body?.body;
  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  // GitHub accepts a bare approval but requires a body for the other two events.
  if (!body && event !== "approve") {
    throw new Error(
      event === "comment"
        ? "A comment is required to leave a review comment."
        : "A comment is required when requesting changes.",
    );
  }

  return { event, body };
}
