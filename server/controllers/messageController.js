import { toggleReaction } from '../services/messageService.js';
import { allowedReactions } from '../utils/validation.js';
import { ServiceError } from '../utils/errors.js';

export const createMessageController = (socketManager) => ({
  toggleReaction: async (req, res) => {
    const userId = req.user.userId;
    const messageId = req.params.id;
    const { emoji } = req.body || {};

    if (!allowedReactions.has(emoji)) {
      throw new ServiceError(400, 'Invalid reaction');
    }

    const result = await toggleReaction({ messageId, userId, emoji });
    if (!result?.conversation_id) {
      throw new ServiceError(403, 'Forbidden');
    }

    socketManager.emitToConversation(result.conversation_id, 'reaction:update', {
      messageId,
      reactions: result.reactions,
    });
    res.json({ messageId, reactions: result.reactions });
  },
});
