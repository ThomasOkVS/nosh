import { useCallback, useLayoutEffect, useRef, type ComponentProps, type Ref } from "react";
import { cn } from "@/lib/utils";

/** Sets the height to the content's, so the text is shown in full (REC-28). */
function fit(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * REC-28: a text area that grows with its content instead of scrolling or
 * clipping. Measured by hand rather than with `field-sizing: content`, which
 * older iOS Safari lacks. Works uncontrolled (react-hook-form's `register`).
 */
export function AutoGrowTextarea({
  className,
  onInput,
  ref,
  ...props
}: ComponentProps<"textarea">) {
  const own = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      own.current = element;
      assign(ref, element);
    },
    [ref],
  );

  // Values loaded before mount (an edit form) need fitting without any typing.
  useLayoutEffect(() => {
    if (own.current) fit(own.current);
  });

  return (
    <textarea
      ref={setRef}
      rows={1}
      onInput={(event) => {
        fit(event.currentTarget);
        onInput?.(event);
      }}
      className={cn(
        "w-full min-w-0 resize-none overflow-hidden rounded-xl border border-input bg-card px-3 py-2 text-base leading-6 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function assign<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
