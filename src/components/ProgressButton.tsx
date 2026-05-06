import React from "react";

interface ProgressButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  progress?: number; // 0-1, defaults to 0
  children: React.ReactNode;
}

export const ProgressButton: React.FC<ProgressButtonProps> = ({
  progress = 0,
  children,
  className = "",
  ...buttonProps
}) => {
  const progressPercent = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <button
      className={`button-paper relative overflow-hidden w-full ${className}`}
      {...buttonProps}
    >
      {/* Fill background that grows from left to right */}
      <div
        className="absolute inset-0 bg-gold/70 transition-all duration-200 origin-left"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Button text with z-index to stay above fill */}
      <span className="relative z-10">{children}</span>
    </button>
  );
};
