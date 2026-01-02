import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

it("renders with default classes", () => {
  const { container } = render(<Skeleton data-testid="skeleton" />);
  const el = container.querySelector("[data-testid='skeleton']");
  expect(el).toBeInTheDocument();
  expect(el).toHaveClass("animate-pulse");
  expect(el).toHaveClass("rounded-md");
});
