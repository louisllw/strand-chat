alter table conversation_members add column if not exists hidden_at timestamptz;
alter table conversation_members add column if not exists cleared_at timestamptz;
update conversation_members
set cleared_at = hidden_at
where cleared_at is null and hidden_at is not null;

alter table conversation_members add column if not exists unread_count int not null default 0;
update conversation_members cm
set unread_count = sub.unread_count
from (
  select m.conversation_id, m.sender_id as user_id, count(*)::int as unread_count
  from messages m
  join conversation_members cm2 on cm2.conversation_id = m.conversation_id
  where cm2.user_id = m.sender_id
    and cm2.hidden_at is null
  group by m.conversation_id, m.sender_id
) sub
where cm.conversation_id = sub.conversation_id and cm.user_id = sub.user_id;

alter table users add column if not exists phone text;
alter table users add column if not exists bio text;
alter table users add column if not exists banner_url text;
alter table users add column if not exists website_url text;
alter table users add column if not exists social_x text;
alter table users add column if not exists social_instagram text;
alter table users add column if not exists social_linkedin text;
alter table users add column if not exists social_tiktok text;
alter table users add column if not exists social_youtube text;
alter table users add column if not exists social_facebook text;
alter table users add column if not exists social_github text;

alter table messages drop constraint if exists messages_type_check;
alter table messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'system'));

create unique index if not exists idx_users_username_normalized_unique
  on users (regexp_replace(lower(trim(username)), '^@+', ''));
