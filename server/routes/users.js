import { Router } from 'express';
import {
  usernameAvailability,
  updateMe,
  getEmojiRecentsForMe,
  addEmojiRecentForMe,
  getUserById,
} from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/username-availability', requireAuth, asyncHandler(usernameAvailability));
router.patch('/me', requireAuth, asyncHandler(updateMe));
router.get('/me/emoji-recents', requireAuth, asyncHandler(getEmojiRecentsForMe));
router.post('/me/emoji-recents', requireAuth, asyncHandler(addEmojiRecentForMe));
router.get('/:id', requireAuth, asyncHandler(getUserById));

export default router;
