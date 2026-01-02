import type { Request, Response } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { toggleReaction } from '../services/messageService.js';
import { allowedReactions } from '../utils/validation.js';
import { ServiceError } from '../utils/errors.js';

export const createMessageController = (socketManager: SocketManager) => ({
  toggleReaction: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const messageId = req.params.id;
    const { emoji } = req.body || {};

    if (!allowedReactions.has(emoji)) {
      throw new ServiceError(400, 'REACTION_INVALID', 'Invalid reaction');
    }

    const result = await toggleReaction({ messageId, userId, emoji });
    if (!result?.conversation_id) {
      throw new ServiceError(403, 'REACTION_FORBIDDEN', 'Forbidden');
    }

    socketManager.emitToConversation(result.conversation_id, 'reaction:update', {
      messageId,
      reactions: result.reactions,
    });
    res.json({ messageId, reactions: result.reactions });
  },
});
