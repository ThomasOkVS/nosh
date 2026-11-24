import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./PasswordInput";

// AUTH-19: hidden by default, toggled by "Show password" / "Hide password".
describe("PasswordInput (AUTH-19)", () => {
  it("hides the value by default and toggles it", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("reports the value as it changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordInput aria-label="Password" onChange={onChange} />);
    await user.type(screen.getByLabelText("Password"), "abc");
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["a", "ab", "abc"]);
  });
});
