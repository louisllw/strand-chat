import { useCallback, useEffect, useMemo, useState, useRef, KeyboardEvent } from 'react';
import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatMessages } from '@/contexts/useChatMessages';
import { useSocket } from '@/contexts/useSocket';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import emojiMartData from '@emoji-mart/data';
import { Send, Smile, Mic, ImagePlus } from 'lucide-react';
import { apiFetch, getCsrfToken } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

interface MessageInputProps {
  className?: string;
}

export const MessageInput = ({ className }: MessageInputProps) => {
  const TYPING_TIMEOUT_MS = 1200;
  const MAX_IMAGE_DIMENSION = 2048;
  const THUMBNAIL_MAX_DIMENSION = 480;
  const RESIZE_SIZE_THRESHOLD_BYTES = 4 * 1024 * 1024;
  const JPEG_QUALITY = 0.85;
  const [message, setMessage] = useState('');
  const { activeConversation } = useChatConversations();
  const { sendMessage, replyToMessage, setReplyToMessage } = useChatMessages();
  const { socket } = useSocket();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const emojiScrollRef = useRef<HTMLDivElement | null>(null);
  const emojiSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const lastToastProgressRef = useRef<number | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    path: string;
    filename: string;
    width?: number;
    height?: number;
    thumbnailPath?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    previewUrl?: string;
    conversationId: string;
  } | null>(null);
  const uploadSessionRef = useRef<{
    conversationId: string;
    cancelled: boolean;
    xhrs: Set<XMLHttpRequest>;
  } | null>(null);
  const conversationIdRef = useRef<string | null>(activeConversation?.id ?? null);
  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
    setEmojiQuery('');
  }, []);

  const toggleEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(prev => {
      const next = !prev;
      if (!next) {
        setEmojiQuery('');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const element = containerRef.current;
    const updateHeightVar = () => {
      const height = element.offsetHeight;
      document.documentElement.style.setProperty('--chat-input-height', `${height}px`);
    };
    updateHeightVar();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateHeightVar);
      observer.observe(element);
    }

    window.addEventListener('resize', updateHeightVar);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeightVar);
      document.documentElement.style.removeProperty('--chat-input-height');
    };
  }, []);

  const clearPendingImage = useCallback(() => {
    setPendingImage((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => () => clearPendingImage(), [clearPendingImage]);

  const cancelActiveUpload = useCallback((reason?: string) => {
    const session = uploadSessionRef.current;
    if (session) {
      session.cancelled = true;
      session.xhrs.forEach((xhr) => xhr.abort());
      session.xhrs.clear();
      uploadSessionRef.current = null;
    }
    setIsUploadingImage(false);
    setUploadProgress(null);
    clearPendingImage();
    if (reason) {
      toast({
        title: 'Upload cancelled',
        description: reason,
        variant: 'destructive',
      });
    }
  }, [clearPendingImage]);

  useEffect(() => {
    const currentId = activeConversation?.id ?? null;
    const previousId = conversationIdRef.current;
    if (previousId && previousId !== currentId) {
      if (uploadSessionRef.current) {
        cancelActiveUpload('Stay in the chat to finish an upload.');
      } else if (pendingImage && pendingImage.conversationId !== currentId) {
        clearPendingImage();
      }
    }
    conversationIdRef.current = currentId;
  }, [activeConversation?.id, cancelActiveUpload, clearPendingImage, pendingImage]);

  useEffect(() => {
    if (!socket || !activeConversation) return;
    const conversationId = activeConversation.id;
    const stopTyping = () => {
      if (socket?.connected) {
        socket.emit('typing:stop', { conversationId });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        stopTyping();
      }
    };
    window.addEventListener('blur', stopTyping);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', stopTyping);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopTyping();
    };
  }, [activeConversation, socket]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        closeEmojiPicker();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeEmojiPicker, isEmojiPickerOpen]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    apiFetch<{ emojis: string[] }>('/api/users/me/emoji-recents')
      .then(data => setRecentEmojis(data.emojis))
      .catch((error) => {
        void error;
      });
  }, [isEmojiPickerOpen]);

  const isLeftConversation = Boolean(activeConversation?.leftAt);

  const renderUploadDescription = (percent: number, filename: string) => (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground truncate">{filename}</div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );

  const guessMimeType = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return null;
  };

  const uploadImage = async (file: File) => {
    if (isLeftConversation) return;
    if (!activeConversation) return;
    if (pendingImage) {
      toast({
        title: 'Image ready to send',
        description: 'Send or remove the current image before uploading another.',
      });
      return;
    }
    const uploadConversationId = activeConversation.id;
    let inferredType = file.type || guessMimeType(file.name) || '';
    if (!inferredType.startsWith('image/')) {
      toast({
        title: 'Unsupported file',
        description: 'Please choose an image file.',
        variant: 'destructive',
      });
      return;
    }
    const session = {
      conversationId: uploadConversationId,
      cancelled: false,
      xhrs: new Set<XMLHttpRequest>(),
    };
    uploadSessionRef.current = session;
    setIsUploadingImage(true);
    setUploadProgress(0);
    lastToastProgressRef.current = 0;
    const uploadToast = toast({
      title: 'Uploading image',
      description: renderUploadDescription(0, file.name || 'Image'),
      duration: 600000,
    });
    try {
      const prepared = await prepareImageForUpload(file, inferredType);
      const token = await getCsrfToken();
      const totalBytes = prepared.file.size + (prepared.thumbnailFile?.size || 0);
      let totalLoaded = 0;
      const updateProgress = (delta: number) => {
        totalLoaded = Math.max(0, Math.min(totalBytes, totalLoaded + delta));
        const percent = totalBytes > 0 ? Math.round((totalLoaded / totalBytes) * 100) : 0;
        setUploadProgress(percent);
        if (lastToastProgressRef.current !== percent) {
          lastToastProgressRef.current = percent;
          uploadToast.update({
            title: 'Uploading image',
            description: renderUploadDescription(percent, file.name || 'Image'),
            duration: 600000,
          });
        }
      };

      const uploadPreparedFile = async (fileToUpload: File) => {
        if (session.cancelled) {
          throw new Error('UPLOAD_CANCELLED');
        }
        const init = await apiFetch<{ uploadId: string; chunkSize: number; totalChunks: number }>(
          '/api/uploads/images/init',
          {
            method: 'POST',
            body: JSON.stringify({
              size: fileToUpload.size,
              mimeType: fileToUpload.type || inferredType,
              filename: fileToUpload.name,
            }),
          }
        );
        const chunkLoaded = new Array(init.totalChunks).fill(0);
        const uploadChunk = (index: number) => {
          if (session.cancelled) {
            return Promise.reject(new Error('UPLOAD_CANCELLED'));
          }
          const start = index * init.chunkSize;
          const end = Math.min(start + init.chunkSize, fileToUpload.size);
          const chunk = fileToUpload.slice(start, end);
          return new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            session.xhrs.add(xhr);
            xhr.open('POST', `/api/uploads/images/${init.uploadId}/chunk?index=${index}`, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.setRequestHeader('x-csrf-token', token);
            xhr.upload.addEventListener('progress', (event) => {
              if (!event.lengthComputable) return;
              const prev = chunkLoaded[index];
              const next = Math.min(event.loaded, chunk.size);
              chunkLoaded[index] = next;
              updateProgress(next - prev);
            });
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                session.xhrs.delete(xhr);
                const prev = chunkLoaded[index];
                const next = chunk.size;
                chunkLoaded[index] = next;
                updateProgress(next - prev);
                resolve();
                return;
              }
              session.xhrs.delete(xhr);
              reject(new Error(xhr.responseText || 'Upload failed.'));
            };
            xhr.onerror = () => {
              session.xhrs.delete(xhr);
              reject(new Error('Upload failed.'));
            };
            xhr.onabort = () => {
              session.xhrs.delete(xhr);
              reject(new Error('UPLOAD_CANCELLED'));
            };
            xhr.send(chunk);
          });
        };
        const concurrency = 3;
        const MAX_RETRIES = 2;
        const uploadWithRetry = async (index: number) => {
          let attempt = 0;
          while (true) {
            try {
              await uploadChunk(index);
              return;
            } catch (error) {
              if (attempt >= MAX_RETRIES) throw error;
              attempt += 1;
              await new Promise(resolve => setTimeout(resolve, 300 * Math.pow(2, attempt)));
            }
          }
        };
        let nextIndex = 0;
        const workers = new Array(Math.min(concurrency, init.totalChunks)).fill(0).map(async () => {
          while (nextIndex < init.totalChunks) {
            if (session.cancelled) {
              throw new Error('UPLOAD_CANCELLED');
            }
            const current = nextIndex;
            nextIndex += 1;
            await uploadWithRetry(current);
          }
        });
        await Promise.all(workers);
        if (session.cancelled || activeConversation.id !== uploadConversationId) {
          throw new Error('UPLOAD_CANCELLED');
        }
        const { path } = await apiFetch<{ path: string }>('/api/uploads/images/complete', {
          method: 'POST',
          body: JSON.stringify({ uploadId: init.uploadId }),
        });
        return path;
      };

      inferredType = prepared.file.type || inferredType;
      const path = await uploadPreparedFile(prepared.file);
      const thumbnailPath = prepared.thumbnailFile
        ? await uploadPreparedFile(prepared.thumbnailFile)
        : undefined;

      setUploadProgress(100);
      uploadToast.update({
        title: 'Image ready to send',
        description: file.name || 'Image',
        duration: 3000,
      });
      const previewUrl = URL.createObjectURL(prepared.file);
      setPendingImage({
        path,
        filename: file.name || 'Image',
        width: prepared.width,
        height: prepared.height,
        thumbnailPath,
        thumbnailWidth: prepared.thumbnailWidth,
        thumbnailHeight: prepared.thumbnailHeight,
        previewUrl,
        conversationId: uploadConversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      if (message === 'UPLOAD_CANCELLED') {
        uploadToast.update({
          title: 'Upload cancelled',
          description: 'Stay in the chat to finish an upload.',
          duration: 3000,
        });
      } else {
        uploadToast.update({
          title: 'Image upload failed',
          description: message,
          variant: 'destructive',
          duration: 8000,
          action: (
            <ToastAction altText="Retry upload" onClick={() => uploadImage(file)}>
              Retry
            </ToastAction>
          ),
        });
      }
    } finally {
      uploadSessionRef.current = null;
      setIsUploadingImage(false);
      setUploadProgress(null);
    }
  };

  const resizeImageInWorker = async (file: File, mimeType: string) => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return { file };
    }
    return new Promise<{
      file: File;
      width?: number;
      height?: number;
      thumbnailFile?: File;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    }>((resolve) => {
      const worker = new Worker(new URL('../../workers/imageResizeWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent) => {
        const {
          buffer,
          type,
          error,
          width,
          height,
          thumbnailBuffer,
          thumbnailType,
          thumbnailWidth,
          thumbnailHeight,
        } = event.data as {
          buffer?: ArrayBuffer;
          type?: string;
          error?: string;
          width?: number;
          height?: number;
          thumbnailBuffer?: ArrayBuffer;
          thumbnailType?: string;
          thumbnailWidth?: number;
          thumbnailHeight?: number;
        };
        worker.terminate();
        if (error || !buffer || !type) {
          resolve({ file });
          return;
        }
        const mainFile = new File([buffer], file.name, { type, lastModified: file.lastModified });
        const thumbFile = thumbnailBuffer && thumbnailType
          ? new File([thumbnailBuffer], `thumb-${file.name}`, { type: thumbnailType, lastModified: file.lastModified })
          : undefined;
        resolve({
          file: mainFile,
          width,
          height,
          thumbnailFile: thumbFile,
          thumbnailWidth,
          thumbnailHeight,
        });
      };
      worker.onerror = () => {
        worker.terminate();
        resolve({ file });
      };
      file.arrayBuffer().then((buffer) => {
        worker.postMessage(
          {
            buffer,
            type: mimeType,
            maxDimension: MAX_IMAGE_DIMENSION,
            quality: JPEG_QUALITY,
            thumbnailMaxDimension: THUMBNAIL_MAX_DIMENSION,
          },
          [buffer]
        );
      }).catch(() => {
        worker.terminate();
        resolve({ file });
      });
    });
  };

  const prepareImageForUpload = async (file: File, mimeType: string) => {
    if (file.size < RESIZE_SIZE_THRESHOLD_BYTES) {
      return resizeImageInWorker(file, mimeType);
    }
    return resizeImageInWorker(file, mimeType);
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void uploadImage(file);
  };

  const addEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage(prev => prev + emoji);
    } else {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const nextValue = message.slice(0, start) + emoji + message.slice(end);
      setMessage(nextValue);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + emoji.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    }
    setRecentEmojis(prev => {
      const next = [emoji, ...prev.filter(item => item !== emoji)];
      return next.slice(0, 24);
    });
    apiFetch('/api/users/me/emoji-recents', {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }).catch((error) => {
      void error;
    });
  };

  const emojiData = emojiMartData as {
    categories: Array<{ id: string; name: string; emojis: string[] }>;
    emojis: Record<string, { id: string; name: string; keywords?: string[]; shortcodes?: string[] | string; skins?: Array<{ native: string }> }>;
  };

  const emojiIndex = useMemo(() => (
    Object.values(emojiData.emojis)
      .map(item => ({
        id: item.id,
        name: item.name,
        keywords: item.keywords || [],
        shortcodes: Array.isArray(item.shortcodes) ? item.shortcodes : item.shortcodes ? [item.shortcodes] : [],
        emoji: item.skins?.[0]?.native,
      }))
      .filter(item => item.emoji)
  ), [emojiData.emojis]);

  const emojiCategories = useMemo(() => (
    emojiData.categories
      .filter(category => category.id !== 'frequent')
      .map(category => ({
        id: category.id,
        label: category.name || category.id,
        emojis: category.emojis
          .map(id => emojiData.emojis[id]?.skins?.[0]?.native)
          .filter(Boolean) as string[],
      }))
  ), [emojiData.categories, emojiData.emojis]);

  const filteredEmojis = useMemo(() => {
    if (!emojiQuery) return [];
    const term = emojiQuery.toLowerCase().trim();

    const categoryMatch = emojiCategories.find(category =>
      (category.label || category.id).toLowerCase().includes(term)
    );
    if (categoryMatch) {
      return categoryMatch.emojis;
    }

    return emojiIndex
      .filter(item =>
        item.emoji?.includes(term)
        || item.name.toLowerCase().includes(term)
        || item.keywords.some(keyword => keyword.toLowerCase().includes(term))
        || item.shortcodes.some(code => code.toLowerCase().includes(term))
      )
      .map(item => item.emoji as string);
  }, [emojiCategories, emojiIndex, emojiQuery]);

  const handleSend = () => {
    if (isLeftConversation) return;
    const trimmed = message.trim();
    if (pendingImage) {
      if (!activeConversation || activeConversation.id !== pendingImage.conversationId) {
        toast({
          title: 'Image not sent',
          description: 'Stay in the chat to send this image.',
          variant: 'destructive',
        });
        clearPendingImage();
        return;
      }
      if (trimmed) {
        sendMessage(trimmed);
      }
      sendMessage(
        pendingImage.filename || 'Image',
        'image',
        pendingImage.path,
        pendingImage.width && pendingImage.height
          ? {
              width: pendingImage.width,
              height: pendingImage.height,
              thumbnailUrl: pendingImage.thumbnailPath,
              thumbnailWidth: pendingImage.thumbnailWidth,
              thumbnailHeight: pendingImage.thumbnailHeight,
            }
          : undefined
      );
      window.dispatchEvent(new CustomEvent('chat:scroll-bottom', {
        detail: { conversationId: activeConversation.id },
      }));
      clearPendingImage();
      setMessage('');
    } else if (trimmed) {
      sendMessage(trimmed);
      setMessage('');
    } else {
      return;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    if (activeConversation && socket?.connected) {
      socket.emit('typing:stop', { conversationId: activeConversation.id });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLeftConversation) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isLeftConversation) return;
    setMessage(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';

    if (activeConversation && socket?.connected) {
      socket.emit('typing:start', { conversationId: activeConversation.id });
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        socket.emit('typing:stop', { conversationId: activeConversation.id });
      }, TYPING_TIMEOUT_MS);
    }
  };

  if (!activeConversation) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute bottom-0 left-0 right-0 z-20 border-t border-border bg-card p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom)+6px)]',
        isLeftConversation && 'opacity-70',
        className
      )}
    >
      <div className="max-w-3xl mx-auto">
        {replyToMessage && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="text-muted-foreground">Replying to</p>
              <p className="truncate">{replyToMessage.content}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReplyToMessage(null)}>
              Cancel
            </Button>
          </div>
        )}
        {pendingImage && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {pendingImage.previewUrl ? (
                  <img
                    src={pendingImage.previewUrl}
                    alt="Pending upload"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground">Image ready to send</p>
                <p className="truncate">{pendingImage.filename}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearPendingImage}>
              Remove
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Message input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onBlur={() => {
                if (activeConversation && socket?.connected) {
                  socket.emit('typing:stop', { conversationId: activeConversation.id });
                }
              }}
              onFocus={() => {
                window.dispatchEvent(new CustomEvent('chat:input-focus'));
              }}
              onKeyDown={handleKeyDown}
              placeholder={isLeftConversation ? 'You left this conversation.' : 'Type a message...'}
              rows={1}
              className="w-full resize-none rounded-xl border border-input bg-background px-3 sm:px-4 py-2.5 sm:py-3 pr-20 sm:pr-24 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 max-h-36"
              disabled={isLeftConversation}
            />
            
            {/* Emoji and mic buttons inside input */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <Button
                variant="icon"
                size="iconSm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLeftConversation || isUploadingImage || Boolean(pendingImage)}
                aria-label="Upload image"
                className={cn(isUploadingImage && 'relative')}
              >
                <ImagePlus className="h-5 w-5" />
                {isUploadingImage && (
                  <span className="absolute -top-2 -right-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    {uploadProgress ?? 0}%
                  </span>
                )}
              </Button>
              <div className="relative" ref={emojiPickerRef}>
                <Button
                  variant="icon"
                  size="iconSm"
                  onClick={toggleEmojiPicker}
                  disabled={isLeftConversation || isUploadingImage}
                  aria-label="Emoji picker"
                >
                  <Smile className="h-5 w-5" />
                </Button>
                {isEmojiPickerOpen && (
                  <div className="absolute bottom-11 right-0 z-20 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-2 shadow-lg">
                    <input
                      type="text"
                      value={emojiQuery}
                      onChange={(e) => setEmojiQuery(e.target.value)}
                      placeholder="Search emoji..."
                      className="mb-2 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    />
                    {!emojiQuery && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {recentEmojis.length > 0 && (
                          <button
                            type="button"
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              const target = emojiSectionRefs.current.recent;
                              if (target && emojiScrollRef.current) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                          >
                            Recent
                          </button>
                        )}
                        {emojiCategories.map(category => (
                          <button
                            key={category.id}
                            type="button"
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              const target = emojiSectionRefs.current[category.id];
                              if (target && emojiScrollRef.current) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                          >
                            {category.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="max-h-56 overflow-y-auto pr-1" ref={emojiScrollRef}>
                      {emojiQuery ? (
                        <>
                          <div className="grid grid-cols-8 gap-1 text-lg">
                            {filteredEmojis.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                className="h-8 w-8 rounded-lg hover:bg-muted"
                                onClick={() => addEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          {filteredEmojis.length === 0 && (
                            <p className="p-2 text-xs text-muted-foreground">No results</p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-4">
                          {recentEmojis.length > 0 && (
                            <div ref={(node) => { emojiSectionRefs.current.recent = node; }}>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">Recent</p>
                              <div className="grid grid-cols-8 gap-1 text-lg">
                                {recentEmojis.map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="h-8 w-8 rounded-lg hover:bg-muted"
                                    onClick={() => addEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {emojiCategories.map(category => (
                            <div key={category.id} ref={(node) => { emojiSectionRefs.current[category.id] = node; }}>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">{category.label}</p>
                              <div className="grid grid-cols-8 gap-1 text-lg">
                                {category.emojis.map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="h-8 w-8 rounded-lg hover:bg-muted"
                                    onClick={() => addEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="icon" size="iconSm" className="hidden sm:inline-flex" disabled={isUploadingImage}>
                <Mic className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={isLeftConversation || isUploadingImage || (!message.trim() && !pendingImage)}
            className="rounded-xl h-11 w-11 p-0 self-center"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
