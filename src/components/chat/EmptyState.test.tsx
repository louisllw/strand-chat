import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { EmptyState } from "./EmptyState";

it("renders empty state copy and handles menu click", () => {
  const onMenuClick = vi.fn();
  render(<EmptyState onMobileMenuClick={onMenuClick} />);

  expect(screen.getByText("Welcome to Strand Chat")).toBeInTheDocument();
  expect(
    screen.getByText(/Select a conversation from the sidebar/i)
  ).toBeInTheDocument();

  const button = screen.getByRole("button");
  fireEvent.click(button);
  expect(onMenuClick).toHaveBeenCalledTimes(1);
});
