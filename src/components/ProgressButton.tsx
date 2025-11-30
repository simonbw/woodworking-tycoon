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
      className={`button relative overflow-hidden ${className}`}
      {...buttonProps}
    >
      {/* Fill background that grows from left to right */}
      <div
        className="absolute inset-0 bg-amber-600 transition-all duration-200 origin-left"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Button text with z-index to stay above fill */}
      <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {children}
      </span>
    </button>
  );
};
