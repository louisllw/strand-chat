import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const mockApiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@/contexts/useTheme", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

vi.mock("@/contexts/useSocket", () => ({
  useSocket: () => ({
    isConnected: false,
    presenceStatus: "online",
    socket: { connect: vi.fn(), disconnect: vi.fn() },
  }),
}));

const AuthConsumer = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <div>loading</div>;
  return (
    <div>
      {isAuthenticated ? `authed:${user?.email}` : "not-authed"}
    </div>
  );
};

it("loads session and exposes auth state", async () => {
  mockApiFetch.mockResolvedValueOnce({
    user: { id: "user-1", email: "test@example.com", theme: "dark" },
  });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );

  expect(screen.getByText("loading")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText("authed:test@example.com")).toBeInTheDocument()
  );
});
