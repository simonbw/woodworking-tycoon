import React from "react";

/** The public feedback form. Opens in a new tab; the shop keeps running. */
export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSck_Q4nsZys2eBFSRgaTn4lXiBHYALLeg9W7nqZMAkSJB_yuQ/viewform";

interface FeedbackLinkProps {
  /** "chrome" sits on the dark workshop background, "paper" on a paper card. */
  variant?: "chrome" | "paper";
  className?: string;
}

/**
 * Link out to the feedback form. Styled as a button so it reads as one of
 * the menu's actions, but it is an anchor — it leaves the page rather than
 * changing the game.
 */
export const FeedbackLink: React.FC<FeedbackLinkProps> = ({
  variant = "chrome",
  className = "",
}) => (
  <a
    href={FEEDBACK_FORM_URL}
    target="_blank"
    rel="noreferrer"
    className={`${variant === "paper" ? "button-paper" : "button-ghost"} text-center ${className}`}
    data-testid="feedback-link"
  >
    Send Feedback
  </a>
);
