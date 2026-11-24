import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

// PWA-32 (dark mode follows the system, AA contrast) and design §7 (P4 palette).
const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");
const darkStart = css.indexOf("prefers-color-scheme: dark");
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart);

function val(block: string, name: string): string {
  const m = new RegExp(`--${name}:\s*([^;]+);`).exec(block);
  if (!m?.[1]) throw new Error(`missing --${name}`);
  return m[1].trim();
}

const PAPER = "oklch(0.985 0.004 90)";
const INK = "oklch(0.2 0.01 260)";
const MUSTARD = "oklch(0.6 0.13 75)";
const BRIGHT = "oklch(0.86 0.15 88)";

describe("PWA-32 design §7: light tokens are the P4 values", () => {
  it("uses the exact palette", () => {
    expect(val(lightCss, "background")).toBe(PAPER);
    expect(val(lightCss, "card")).toBe("oklch(1 0 0)");
    expect(val(lightCss, "foreground")).toBe(INK);
    expect(val(lightCss, "primary")).toBe(INK);
    expect(val(lightCss, "primary-foreground")).toBe(PAPER);
    expect(val(lightCss, "accent")).toBe(BRIGHT);
    expect(val(lightCss, "ring")).toBe(BRIGHT);
    expect(val(lightCss, "highlight")).toBe(MUSTARD);
  });
  it("declares the fonts", () => {
    expect(val(lightCss, "font-display")).toContain("DM Serif Display");
    expect(val(lightCss, "font-sans")).toContain("DM Sans Variable");
  });
});

describe("PWA-32 design §7: dark tokens", () => {
  it("derives from P4: ink paper, lighter cards, chalk text, unchanged mustards", () => {
    expect(val(darkCss, "background")).toBe("oklch(0.18 0.01 260)");
    expect(val(darkCss, "card")).toBe("oklch(0.23 0.01 260)");
    expect(val(darkCss, "foreground")).toBe(PAPER);
    expect(val(darkCss, "primary")).toBe(PAPER);
    expect(val(darkCss, "primary-foreground")).toBe(INK);
    expect(val(darkCss, "accent")).toBe(BRIGHT);
    expect(val(darkCss, "ring")).toBe(BRIGHT);
    expect(val(darkCss, "highlight")).toBe(MUSTARD);
  });
});

describe("PWA-32 design §7: WCAG AA text contrast (>= 4.5)", () => {
  const pairs: [string, string, string][] = [
    ["ink on paper", val(lightCss, "foreground"), val(lightCss, "background")],
    ["ink on card", val(lightCss, "foreground"), val(lightCss, "card")],
    ["chalk on dark paper", val(darkCss, "foreground"), val(darkCss, "background")],
    ["chalk on dark card", val(darkCss, "foreground"), val(darkCss, "card")],
    ["active pill light: chalk on ink", val(lightCss, "primary-foreground"), val(lightCss, "primary")],
    ["active pill dark: ink on chalk", val(darkCss, "primary-foreground"), val(darkCss, "primary")],
  ];
  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(wcagContrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
