import { RECIPE_LIMITS, RECIPE_MESSAGES } from "@nosh/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TagInput } from "./TagInput";

function Harness({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagInput value={tags} onChange={setTags} />
      <output data-testid="tags">{JSON.stringify(tags)}</output>
      <button type="button">elsewhere</button>
    </>
  );
}

const shown = () => JSON.parse(screen.getByTestId("tags").textContent ?? "[]") as string[];

describe("TagInput", () => {
  it('REC-35: Enter, comma and blur add a lower-cased chip and clear the field; duplicates in any case and empty entries are ignored; Backspace in an empty field removes the last chip; each chip has a remove button; at 30 it adds nothing and says "At most 30 tags"; the hint "Press Enter or comma to add a tag." is shown', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Tags" });
    expect(screen.getByText("Press Enter or comma to add a tag.")).toBeInTheDocument();

    await user.type(field, "  Stew {Enter}");
    expect(shown()).toEqual(["stew"]);
    expect(field).toHaveValue("");

    await user.type(field, "Belgian,");
    expect(shown()).toEqual(["stew", "belgian"]);
    expect(field).toHaveValue("");

    await user.type(field, "Winter");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(shown()).toEqual(["stew", "belgian", "winter"]);
    expect(field).toHaveValue("");

    // Duplicates in any case, and empty entries, add nothing.
    await user.type(field, "STEW{Enter}   ,{Enter}");
    expect(shown()).toEqual(["stew", "belgian", "winter"]);
    expect(field).toHaveValue("");

    expect(screen.getByRole("button", { name: "Remove tag belgian" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove tag belgian" }));
    expect(shown()).toEqual(["stew", "winter"]);

    await user.type(field, "{Backspace}");
    expect(shown()).toEqual(["stew"]);
    // Backspace inside typed text edits the text, not the chips.
    await user.type(field, "ab{Backspace}");
    expect(shown()).toEqual(["stew"]);
    expect(field).toHaveValue("a");
  });

  it("REC-35: at 30 tags the field adds no more and says so", async () => {
    const user = userEvent.setup();
    render(<Harness initial={Array.from({ length: 30 }, (_, i) => `tag${i}`)} />);
    expect(screen.getByText("At most 30 tags")).toBeInTheDocument();
    const field = screen.getByRole("textbox", { name: "Tags" });

    await user.type(field, "extra{Enter}");
    expect(shown()).toHaveLength(30);
    expect(shown()).not.toContain("extra");

    await user.clear(field);
    await user.type(field, "{Backspace}");
    expect(shown()).toHaveLength(29);
    expect(screen.queryByText("At most 30 tags")).not.toBeInTheDocument();
  });

  it("REC-35 REC-03: a tag over 50 characters is refused on Enter, comma or blur with its message, and the typed text stays", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Tags" });
    const long = "a".repeat(RECIPE_LIMITS.tagLength + 1);

    await user.click(field);
    await user.paste(long);
    await user.keyboard("{Enter}");
    expect(shown()).toEqual([]);
    expect(field).toHaveValue(long);
    expect(screen.getByText(RECIPE_MESSAGES.tagTooLong)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(shown()).toEqual([]);
    expect(field).toHaveValue(long);
    expect(screen.getByText(RECIPE_MESSAGES.tagTooLong)).toBeInTheDocument();

    await user.clear(field);
    expect(screen.queryByText(RECIPE_MESSAGES.tagTooLong)).not.toBeInTheDocument();
    await user.paste(`soup,${long},`);
    expect(shown()).toEqual([]);
    expect(field).toHaveValue(`soup,${long},`);
    expect(screen.getByText(RECIPE_MESSAGES.tagTooLong)).toBeInTheDocument();

    // Exactly 50 is a tag.
    await user.clear(field);
    await user.paste("b".repeat(RECIPE_LIMITS.tagLength));
    await user.keyboard("{Enter}");
    expect(shown()).toEqual(["b".repeat(RECIPE_LIMITS.tagLength)]);
    expect(field).toHaveValue("");
    expect(screen.queryByText(RECIPE_MESSAGES.tagTooLong)).not.toBeInTheDocument();
  });

  it("REC-35: Enter in the tag field never submits the form", async () => {
    const user = userEvent.setup();
    let submitted = 0;
    function InForm() {
      const [tags, setTags] = useState<string[]>([]);
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitted++;
          }}
        >
          <TagInput value={tags} onChange={setTags} />
        </form>
      );
    }
    render(<InForm />);
    await user.type(screen.getByRole("textbox", { name: "Tags" }), "stew{Enter}{Enter}");
    expect(submitted).toBe(0);
  });
});
