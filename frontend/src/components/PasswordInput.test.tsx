import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("hides the value by default and reveals it when the toggle is clicked", () => {
    const { container } = render(<PasswordInput id="password" value="secret123" onChange={vi.fn()} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("calls onChange as the user types", () => {
    const onChange = vi.fn();
    const { container } = render(<PasswordInput id="password" value="" onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "hunter2" } });

    expect(onChange).toHaveBeenCalledWith("hunter2");
  });
});
