import React, {
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
  useRef,
  useState,
} from "react";
import {
  arrow,
  autoUpdate,
  flip,
  FloatingArrow,
  FloatingPortal,
  offset,
  Placement,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from "@floating-ui/react";
import { ShortcutId } from "../game/shortcuts";
import { ShortcutKeys } from "./shortcuts/Kbd";

// Paperwork palette (see tailwind.config.ts) — used for the arrow, which is an
// inline SVG and can't take Tailwind fill/stroke utility classes cleanly.
const PAPER_IVORY = "#f5f0e2";
const MANILA_EDGE = "#c9b783";

export interface TooltipProps {
  /**
   * Tooltip body. Accepts rich content (elements), not just strings. When
   * nullish, no tooltip is attached and the child renders untouched.
   */
  content?: ReactNode;
  /**
   * Shortcut this control is also bound to. Its key caps render after the
   * content, so any tooltipped button advertises its hotkey for free.
   */
  shortcut?: ShortcutId;
  /** The trigger. Must be a single element that can hold a ref + event props. */
  children: ReactElement;
  /** Preferred side; flips automatically near screen edges. Default "top". */
  placement?: Placement;
  /** Hover open delay in ms. Default 250. */
  delay?: number;
  /** Extra classes for the tooltip surface. */
  className?: string;
}

/**
 * Reusable hover/focus tooltip built on Floating UI. Positions itself with
 * edge-collision handling (flip + shift), renders through a portal so it never
 * clips inside overflow containers, and is styled to the paperwork design
 * system. Attaches directly to its child element (no extra DOM wrapper).
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  children,
  placement = "top",
  delay = 250,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: delay, close: 0 },
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // Merge our reference ref with any ref the child already carries.
  const childRef = (children as { ref?: React.Ref<unknown> }).ref;
  const mergedRef = useMergeRefs([refs.setReference, childRef]);

  if ((content == null && shortcut == null) || !isValidElement(children)) {
    return <>{children}</>;
  }

  const trigger = cloneElement(
    children,
    getReferenceProps({
      ref: mergedRef,
      ...(children.props as Record<string, unknown>),
    }),
  );

  return (
    <>
      {trigger}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={
              // pointer-events-none: a hover hint must never swallow the
              // click aimed at whatever sits under or beside it
              "pointer-events-none z-50 max-w-xs rounded-sm border " +
              "border-paper-manila-edge bg-paper-ivory px-2 py-1 text-xs " +
              "leading-snug text-ink-black shadow-lg" +
              (className ? " " + className : "")
            }
          >
            {shortcut ? (
              <span className="inline-flex items-baseline gap-1.5">
                {content}
                <ShortcutKeys shortcut={shortcut} />
              </span>
            ) : (
              content
            )}
            <FloatingArrow
              ref={arrowRef}
              context={context}
              fill={PAPER_IVORY}
              stroke={MANILA_EDGE}
              strokeWidth={1}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
};
