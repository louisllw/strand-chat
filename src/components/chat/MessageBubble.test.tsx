import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { MessageBubble } from "./MessageBubble";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Message } from "@/types";

const renderWithTooltip = (ui: ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe("MessageBubble", () => {
  it("renders system messages without sender details", () => {
    const message: Message = {
      id: "m1",
      content: "System notice",
      senderId: "system",
      conversationId: "c1",
      timestamp: new Date(),
      read: false,
      type: "system",
    };

    renderWithTooltip(<MessageBubble message={message} isSent={false} />);
    expect(screen.getByText("System notice")).toBeInTheDocument();
  });

  it("renders reply and reactions, and handles actions", () => {
    const onReply = vi.fn();
    const onToggleReaction = vi.fn();
    const onJumpToMessage = vi.fn();
    const onSelect = vi.fn();
    const message: Message = {
      id: "m2",
      content: "Hello there",
      senderId: "u1",
      conversationId: "c1",
      timestamp: new Date("2024-01-01T12:00:00Z"),
      read: true,
      type: "text",
      replyTo: {
        id: "m1",
        content: "Earlier message",
        senderId: "u2",
      },
      reactions: [
        {
          emoji: "👍",
          count: 2,
          reactedByMe: true,
          usernames: ["alex", "sam"],
        },
      ],
    };

    renderWithTooltip(
      <MessageBubble
        message={message}
        isSent={true}
        senderName="Alex"
        onReply={onReply}
        onJumpToMessage={onJumpToMessage}
        onToggleReaction={onToggleReaction}
        isSelected={true}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByText("Replying to"));
    expect(onJumpToMessage).toHaveBeenCalledWith("m1");

    fireEvent.click(screen.getByText("Hello there"));
    expect(onSelect).toHaveBeenCalledWith("m2");

    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(message);

    fireEvent.click(screen.getByText("👍 2"));
    expect(onToggleReaction).toHaveBeenCalledWith("m2", "👍");
  });

  it("renders image and file messages", () => {
    const imageMessage: Message = {
      id: "m3",
      content: "image",
      senderId: "u1",
      conversationId: "c1",
      timestamp: new Date(),
      read: false,
      type: "image",
      attachmentUrl: "https://example.com/image.png",
    };
    const fileMessage: Message = {
      id: "m4",
      content: "file.pdf",
      senderId: "u2",
      conversationId: "c1",
      timestamp: new Date(),
      read: false,
      type: "file",
    };

    renderWithTooltip(<MessageBubble message={imageMessage} isSent={false} />);
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByAltText("Attachment")).toBeInTheDocument();

    renderWithTooltip(<MessageBubble message={fileMessage} isSent={false} />);
    expect(screen.getByText("file.pdf")).toBeInTheDocument();
  });

  it("opens reaction picker and sends reaction", () => {
    const onToggleReaction = vi.fn();
    const message: Message = {
      id: "m5",
      content: "React to me",
      senderId: "u1",
      conversationId: "c1",
      timestamp: new Date(),
      read: false,
      type: "text",
    };

    renderWithTooltip(
      <MessageBubble
        message={message}
        isSent={true}
        isSelected={true}
        onToggleReaction={onToggleReaction}
      />
    );

    fireEvent.click(screen.getByLabelText("Add reaction"));
    fireEvent.click(screen.getByText("❤️"));
    expect(onToggleReaction).toHaveBeenCalledWith("m5", "❤️");
  });

  it("renders sender name, mention highlights, and empty reaction prompt", () => {
    const message: Message = {
      id: "m6",
      content: "Hi @alex",
      senderId: "u3",
      conversationId: "c1",
      timestamp: new Date(),
      read: false,
      type: "text",
    };

    renderWithTooltip(
      <MessageBubble
        message={message}
        isSent={false}
        senderName="Alex"
        isHighlighted={true}
        isSelected={true}
        onToggleReaction={vi.fn()}
      />
    );

    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("@alex")).toBeInTheDocument();
    expect(screen.getByText("Add a reaction")).toBeInTheDocument();
  });

  it("re-renders when message details change", () => {
    const baseMessage: Message = {
      id: "m7",
      content: "Base",
      senderId: "u1",
      conversationId: "c1",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      read: false,
      type: "text",
      reactions: [
        { emoji: "👍", count: 1, reactedByMe: false, usernames: ["alex"] },
      ],
    };

    const { rerender } = renderWithTooltip(
      <MessageBubble message={baseMessage} isSent={true} />
    );

    rerender(
      <TooltipProvider>
        <MessageBubble message={baseMessage} isSent={true} />
      </TooltipProvider>
    );

    const nextMessage: Message = {
      ...baseMessage,
      read: true,
      content: "Updated",
      reactions: [
        { emoji: "👍", count: 2, reactedByMe: true, usernames: ["alex", "sam"] },
      ],
    };

    rerender(
      <TooltipProvider>
        <MessageBubble message={nextMessage} isSent={true} />
      </TooltipProvider>
    );
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });
});
