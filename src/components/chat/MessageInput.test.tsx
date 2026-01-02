import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput } from "./MessageInput";

const mockSendMessage = vi.fn();
const mockSetReplyToMessage = vi.fn();
let mockReplyToMessage: { content: string } | null = null;
let mockActiveConversation: { id: string } | null = { id: "conversation-1" };
const mockEmit = vi.fn();
const mockApiFetch = vi.fn();

vi.mock("@/contexts/useChatConversations", () => ({
  useChatConversations: () => ({
    activeConversation: mockActiveConversation,
  }),
}));

vi.mock("@/contexts/useChatMessages", () => ({
  useChatMessages: () => ({
    sendMessage: mockSendMessage,
    replyToMessage: mockReplyToMessage,
    setReplyToMessage: mockSetReplyToMessage,
  }),
}));

vi.mock("@/contexts/useSocket", () => ({
  useSocket: () => ({
    socket: {
      connected: true,
      emit: mockEmit,
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@emoji-mart/data", () => ({
  default: {
    categories: [
      { id: "people", name: "People", emojis: ["grinning", "thumbs_up"] },
    ],
    emojis: {
      grinning: {
        id: "grinning",
        name: "grinning",
        keywords: ["face"],
        shortcodes: "grin",
        skins: [{ native: "😀" }],
      },
      thumbs_up: {
        id: "thumbs_up",
        name: "thumbs up",
        keywords: ["thumb"],
        shortcodes: ["thumbsup"],
        skins: [{ native: "👍" }],
      },
    },
  },
}));

beforeAll(() => {
  if (!("ResizeObserver" in window)) {
    class ResizeObserver {
      observe() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserver;
  }
});

beforeEach(() => {
  mockSendMessage.mockReset();
  mockSetReplyToMessage.mockReset();
  mockEmit.mockReset();
  mockApiFetch.mockReset();
  mockReplyToMessage = null;
  mockActiveConversation = { id: "conversation-1" };
  mockApiFetch.mockResolvedValue({ emojis: ["😀"] });
});

describe("MessageInput", () => {
  it("renders nothing when there is no active conversation", () => {
    mockActiveConversation = null;
    const { container } = render(<MessageInput />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
  });

  it("sends a trimmed message and stops typing", () => {
    vi.useFakeTimers();
    render(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: " hello " } });

    expect(mockEmit).toHaveBeenCalledWith("typing:start", {
      conversationId: "conversation-1",
    });

    const buttons = screen.getAllByRole("button");
    const sendButton = buttons[buttons.length - 1];
    fireEvent.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith("hello");
    expect(mockEmit).toHaveBeenCalledWith("typing:stop", {
      conversationId: "conversation-1",
    });

    act(() => {
      vi.runAllTimers();
    });

    vi.useRealTimers();
  });

  it("clears reply state when cancel is clicked", () => {
    mockReplyToMessage = { content: "Reply text" };
    render(<MessageInput />);

    expect(screen.getByText("Replying to")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockSetReplyToMessage).toHaveBeenCalledWith(null);
  });

  it("opens emoji picker, filters emojis, and inserts emoji", async () => {
    render(<MessageInput />);

    const emojiButton = screen.getAllByRole("button")[2];
    fireEvent.click(emojiButton);

    const searchInput = await screen.findByPlaceholderText(/search emoji/i);
    fireEvent.change(searchInput, { target: { value: "thumb" } });

    const filteredEmoji = await screen.findByRole("button", { name: "👍" });
    fireEvent.click(filteredEmoji);

    const textarea = screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("👍");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/users/me/emoji-recents");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/users/me/emoji-recents", {
      method: "POST",
      body: JSON.stringify({ emoji: "👍" }),
    });
  });

  it("shows recent emojis and closes picker on outside click", async () => {
    render(<MessageInput />);

    const emojiButton = screen.getAllByRole("button")[2];
    fireEvent.click(emojiButton);

    await waitFor(() =>
      expect(screen.getAllByText("Recent").length).toBeGreaterThan(0)
    );

    fireEvent.mouseDown(document.body);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/search emoji/i)).not.toBeInTheDocument()
    );
  });

  it("sends on enter but not shift+enter", () => {
    render(<MessageInput />);
    const textarea = screen.getByPlaceholderText(/type a message/i);

    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockSendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockSendMessage).toHaveBeenCalledWith("Hello");
  });
});
