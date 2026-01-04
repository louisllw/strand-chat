import type { User } from '@/types';

export const getDirectParticipant = (
  participants: User[] | undefined,
  currentUserId?: string | null
) => {
  if (!participants || participants.length === 0) return null;
  if (!currentUserId) return participants[0] ?? null;
  return participants.find((participant) => participant.id !== currentUserId) ?? participants[0] ?? null;
};
