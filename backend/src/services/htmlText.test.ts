import { describe, expect, it } from "vitest";
import { stripHtmlToText } from "./htmlText";

describe("stripHtmlToText", () => {
  it("removes script, style, nav, header, and footer content", () => {
    // The inline script body is built via concatenation, not a literal
    // "</script>" substring, since that would end the script tag early in
    // any HTML parser (browser or cheerio) regardless of JS string quoting.
    const html =
      "<html>" +
      "<head><style>.a { color: red }</style></head>" +
      "<body>" +
      "<nav>Site nav</nav>" +
      "<header>Site header</header>" +
      "<script>console.log('</" +
      "script literal in a real page would be escaped');</script>" +
      "<main><h1>Tomato Soup</h1><p>A warm classic.</p></main>" +
      "<footer>Site footer</footer>" +
      "</body>" +
      "</html>";
    const text = stripHtmlToText(html);
    expect(text).toContain("Tomato Soup");
    expect(text).toContain("A warm classic.");
    expect(text).not.toContain("Site nav");
    expect(text).not.toContain("Site header");
    expect(text).not.toContain("Site footer");
    expect(text).not.toContain("console.log");
  });

  it("collapses whitespace", () => {
    const html = "<body>  <p>Hello</p>\n\n<p>World</p>  </body>";
    expect(stripHtmlToText(html)).toBe("Hello World");
  });

  it("returns an empty string for an empty body", () => {
    expect(stripHtmlToText("<html><body></body></html>")).toBe("");
  });
});
