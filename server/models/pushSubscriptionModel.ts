import { query } from '../db.js';

export type StoredPushSubscription = {
  userId: string;
  endpoint: string;
  subscription: unknown;
};

export const upsertPushSubscription = async ({
  userId,
  endpoint,
  subscription,
}: {
  userId: string;
  endpoint: string;
  subscription: unknown;
}) => {
  await query(
    `
      insert into push_subscriptions (user_id, endpoint, subscription)
      values ($1, $2, $3)
      on conflict (endpoint)
      do update set
        user_id = excluded.user_id,
        subscription = excluded.subscription,
        updated_at = now()
    `,
    [userId, endpoint, subscription]
  );
};

export const deletePushSubscription = async ({
  userId,
  endpoint,
}: {
  userId: string;
  endpoint: string;
}) => {
  await query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [userId, endpoint]);
};

export const deletePushSubscriptionByEndpoint = async (endpoint: string) => {
  await query('delete from push_subscriptions where endpoint = $1', [endpoint]);
};

export const listPushSubscriptionsByUserIds = async (userIds: string[]): Promise<StoredPushSubscription[]> => {
  if (userIds.length === 0) return [];
  const result = await query(
    `select user_id, endpoint, subscription from push_subscriptions where user_id = any($1::uuid[])`,
    [userIds]
  );
  return result.rows.map((row) => ({
    userId: row.user_id as string,
    endpoint: row.endpoint as string,
    subscription: row.subscription as unknown,
  }));
};
