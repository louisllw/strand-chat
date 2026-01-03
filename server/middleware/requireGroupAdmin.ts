import type { NextFunction, Request, Response } from 'express';
import {
  getConversationMemberRole,
  getConversationTypeForMember,
  hasConversationAdmin,
} from '../models/conversationModel.js';

export const requireGroupAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const conversationId = req.params.id;
  if (!conversationId) {
    return res.status(400).json({ error: 'Invalid conversation' });
  }

  const conversationType = await getConversationTypeForMember({
    conversationId,
    userId: req.user!.userId,
  });
  if (!conversationType) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (conversationType !== 'group') {
    return res.status(400).json({ error: 'Group chat required' });
  }

  const role = await getConversationMemberRole({
    conversationId,
    userId: req.user!.userId,
  });
  const hasAdmin = await hasConversationAdmin({ conversationId });
  if (hasAdmin && role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  return next();
};
