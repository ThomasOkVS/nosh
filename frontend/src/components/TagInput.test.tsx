import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";

describe("TagInput", () => {
  it("commits a tag on Enter and clears the draft", () => {
    const onChange = vi.fn();
    const { rerender, container } = render(<TagInput value={[]} onChange={onChange} />);

    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "belgian" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["belgian"]);

    rerender(<TagInput value={["belgian"]} onChange={onChange} />);
    expect(screen.getByText("belgian")).toBeInTheDocument();
  });

  it("commits a tag on comma", () => {
    const onChange = vi.fn();
    const { container } = render(<TagInput value={["a"]} onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "stew" } });
    fireEvent.keyDown(input, { key: "," });

    expect(onChange).toHaveBeenCalledWith(["a", "stew"]);
  });

  it("does not add a duplicate tag", () => {
    const onChange = vi.fn();
    const { container } = render(<TagInput value={["belgian"]} onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "belgian" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes the last tag on backspace when the draft is empty", () => {
    const onChange = vi.fn();
    const { container } = render(<TagInput value={["belgian", "stew"]} onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["belgian"]);
  });

  it("removes a specific tag when its remove button is clicked", () => {
    const onChange = vi.fn();
    render(<TagInput value={["belgian", "stew"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove belgian" }));

    expect(onChange).toHaveBeenCalledWith(["stew"]);
  });
});
