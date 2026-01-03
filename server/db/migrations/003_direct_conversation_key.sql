alter table conversations add column if not exists direct_key text;

update conversations c
set direct_key = sub.direct_key
from (
  select conversation_id,
         concat(min(user_id::text), ':', max(user_id::text)) as direct_key
  from conversation_members
  group by conversation_id
  having count(*) = 2
) sub
where c.id = sub.conversation_id
  and c.type = 'direct'
  and c.direct_key is null;

create unique index if not exists idx_conversations_direct_key_unique
  on conversations (direct_key)
  where type = 'direct' and direct_key is not null;
