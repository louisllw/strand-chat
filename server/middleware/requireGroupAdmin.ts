import type { NextFunction, Request, Response } from 'express';
import {
  getConversationMemberRole,
  getConversationTypeForMember,
  hasConversationAdmin,
} from '../models/conversationModel.js';
import { sendError } from '../utils/errors.js';

export const requireGroupAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const conversationId = req.params.id;
  if (!conversationId) {
    return sendError(res, 400, 'CONVERSATION_INVALID', 'Invalid conversation');
  }

  const conversationType = await getConversationTypeForMember({
    conversationId,
    userId: req.user!.userId,
  });
  if (!conversationType) {
    return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
  }
  if (conversationType !== 'group') {
    return sendError(res, 400, 'GROUP_REQUIRED', 'Group chat required');
  }

  const role = await getConversationMemberRole({
    conversationId,
    userId: req.user!.userId,
  });
  const hasAdmin = await hasConversationAdmin({ conversationId });
  if (hasAdmin && role !== 'admin') {
    return sendError(res, 403, 'ADMIN_REQUIRED', 'Admin role required');
  }
  return next();
};
