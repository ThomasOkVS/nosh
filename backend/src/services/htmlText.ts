import * as cheerio from "cheerio";

const NOISE_SELECTORS = "script, style, nav, header, footer, svg, noscript, iframe";

/**
 * Reduces a full HTML page down to plain text worth feeding to an LLM: strips
 * markup that's never part of recipe content (scripts, nav/header/footer
 * chrome, etc.) using cheerio's DOM traversal rather than regex tag-stripping,
 * which breaks on things like a `<script>` containing a literal
 * `</script>`-like string inside a JS string.
 */
export function stripHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();
  const text = $("body").text();
  return text.replace(/\s+/g, " ").trim();
}
