import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const mockApiFetch = vi.fn();
const mockSetTheme = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockToast = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  AUTH_UNAUTHORIZED_EVENT: "auth:unauthorized",
}));

vi.mock("@/contexts/useTheme", () => ({
  useTheme: () => ({ setTheme: mockSetTheme }),
}));

vi.mock("@/contexts/useSocket", () => ({
  useSocket: () => ({
    isConnected: false,
    presenceStatus: "online",
    socket: { connect: mockSocketConnect, disconnect: mockSocketDisconnect },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
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

const AuthActions = () => {
  const { login, register, logout, updateUser, user } = useAuth();
  return (
    <div>
      <div data-testid="status">{user?.email ?? "none"}</div>
      <button onClick={() => login("user@example.com", "password")}>login</button>
      <button
        onClick={() =>
          register("Test", "register@example.com", "password")
        }
      >
        register
      </button>
      <button
        onClick={() =>
          updateUser({ email: "updated@example.com", theme: "light" })
        }
      >
        update
      </button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
};

beforeEach(() => {
  mockApiFetch.mockReset();
  mockSetTheme.mockReset();
  mockSocketConnect.mockReset();
  mockSocketDisconnect.mockReset();
  mockToast.mockReset();
});

it("loads session and exposes auth state", async () => {
  const user = { id: "user-1", email: "test@example.com", theme: "dark" };
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/auth/refresh") {
      return Promise.resolve({ user });
    }
    return Promise.resolve({});
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

it("handles unauthorized event by resetting auth and showing toast", async () => {
  const user = { id: "user-1", email: "test@example.com", theme: "dark" };
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/auth/refresh") {
      return Promise.resolve({ user });
    }
    return Promise.resolve({});
  });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );

  await waitFor(() =>
    expect(screen.getByText("authed:test@example.com")).toBeInTheDocument()
  );

  act(() => {
    window.dispatchEvent(new Event("auth:unauthorized"));
  });

  await waitFor(() =>
    expect(screen.getByText("not-authed")).toBeInTheDocument()
  );
  expect(mockToast).toHaveBeenCalled();
  expect(mockSocketDisconnect).toHaveBeenCalled();
});

it("login, register, updateUser, and logout update auth state", async () => {
  let currentUser: { id: string; email: string; theme?: string } | null = null;
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === "/api/auth/refresh") {
      return Promise.resolve({ user: currentUser });
    }
    if (path === "/api/auth/login") {
      currentUser = { id: "user-1", email: "user@example.com", theme: "dark" };
      return Promise.resolve({ user: currentUser });
    }
    if (path === "/api/auth/register") {
      currentUser = { id: "user-2", email: "register@example.com", theme: "dark" };
      return Promise.resolve({ user: currentUser });
    }
    if (path === "/api/users/me") {
      currentUser = { id: "user-2", email: "updated@example.com", theme: "light" };
      return Promise.resolve({ user: currentUser });
    }
    if (path === "/api/auth/logout") {
      currentUser = null;
      return Promise.resolve({});
    }
    if (options?.method === "POST") {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });

  render(
    <AuthProvider>
      <AuthActions />
    </AuthProvider>
  );

  await waitFor(() =>
    expect(screen.getByTestId("status")).toHaveTextContent("none")
  );

  fireEvent.click(screen.getByText("login"));
  await waitFor(() =>
    expect(screen.getByTestId("status")).toHaveTextContent("user@example.com")
  );
  expect(mockSetTheme).toHaveBeenCalledWith("dark");
  expect(mockSocketConnect).toHaveBeenCalled();

  fireEvent.click(screen.getByText("register"));
  await waitFor(() =>
    expect(screen.getByTestId("status")).toHaveTextContent(
      "register@example.com"
    )
  );

  fireEvent.click(screen.getByText("update"));
  await waitFor(() =>
    expect(screen.getByTestId("status")).toHaveTextContent(
      "updated@example.com"
    )
  );
  expect(mockSetTheme).toHaveBeenCalledWith("light");

  fireEvent.click(screen.getByText("logout"));
  await waitFor(() =>
    expect(screen.getByTestId("status")).toHaveTextContent("none")
  );
  expect(mockSocketDisconnect).toHaveBeenCalled();
});
