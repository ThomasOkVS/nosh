import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagChip } from "./TagChip";

describe("TagChip", () => {
  it("renders the default variant as a capitalized pill", () => {
    render(<TagChip tag="dessert" onClick={vi.fn()} />);

    const chip = screen.getByRole("button", { name: "dessert" });
    expect(chip.className).toContain("capitalize");
    expect(chip.className).toContain("rounded-full");
  });

  it("renders the editorial variant as an uppercase label, not a pill", () => {
    render(<TagChip tag="dessert" variant="editorial" onClick={vi.fn()} />);

    const chip = screen.getByRole("button", { name: "dessert" });
    expect(chip.className).not.toContain("capitalize");
    expect(chip.className).not.toContain("rounded-full");
    expect(chip.className).toContain("uppercase");
  });
});
