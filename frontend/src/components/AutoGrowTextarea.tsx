import { useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  onChange: NonNullable<TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"]>;
};

/**
 * A textarea that grows to fit its content instead of scrolling inside a
 * fixed height. Recipe steps vary a lot in length, and a fixed-height box
 * silently clips the longer ones — you can't see what you're editing.
 *
 * `field-sizing: content` (Tailwind's `field-sizing-content`) does exactly
 * this in CSS with no JS, but isn't in Safari yet, so the measuring effect
 * below stays as the fallback. Where the CSS is supported it simply wins and
 * the effect's height is consistent with it.
 */
export function AutoGrowTextarea({ value, className = "", ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Resetting to "auto" first is what lets it shrink again, not just grow —
    // `scrollHeight` never reports less than the element's current height.
    element.style.height = "auto";
    // `scrollHeight` excludes borders, but Tailwind's default `border-box`
    // sizing counts them inside `height` — without adding them back, every
    // box ends up a couple of pixels short and clips its last line.
    const borders = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + borders}px`;
  }, []);

  // useLayoutEffect, not useEffect: it runs before the browser paints, so
  // there's no flash at the wrong height.
  useLayoutEffect(resize, [resize, value]);

  // Width changes (viewport resize, rotation, a late-loading font) reflow the
  // text, so a height measured once goes stale — and with overflow hidden the
  // excess is invisibly clipped, which is the exact failure this component
  // exists to prevent.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={`field-sizing-content resize-none overflow-hidden ${className}`}
    />
  );
}
