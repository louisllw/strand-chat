-- Enable UUID generation
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  avatar_url text,
  banner_url text,
  phone text,
  bio text,
  website_url text,
  social_x text,
  social_instagram text,
  social_linkedin text,
  social_tiktok text,
  social_youtube text,
  social_facebook text,
  social_github text,
  compromised_at timestamptz,
  status text not null default 'offline',
  theme text not null default 'light',
  username_updated_at timestamptz not null default now(),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_users_username_normalized_unique
  on users (regexp_replace(lower(trim(username)), '^@+', ''));

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text not null check (type in ('direct', 'group')),
  direct_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_conversations_direct_key_unique
  on conversations (direct_key)
  where type = 'direct' and direct_key is not null;

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  cleared_at timestamptz,
  hidden_at timestamptz,
  left_at timestamptz,
  unread_count integer not null default 0,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null,
  type text not null default 'text' check (type in ('text', 'image', 'file', 'system')),
  attachment_url text,
  attachment_meta jsonb,
  reply_to_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists idx_message_reactions_message_id on message_reactions (message_id);

create table if not exists user_emoji_recents (
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  last_used_at timestamptz not null default now(),
  primary key (user_id, emoji)
);

create index if not exists idx_user_emoji_recents_user on user_emoji_recents (user_id, last_used_at desc);

create table if not exists message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created_at on messages (conversation_id, created_at);
create index if not exists idx_message_reads_user on message_reads (user_id);
create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);
create index if not exists idx_messages_conversation_sender_created_at on messages (conversation_id, sender_id, created_at);
create index if not exists idx_conversation_members_user_hidden on conversation_members (user_id, hidden_at);
create index if not exists idx_conversation_members_conversation_hidden on conversation_members (conversation_id, hidden_at);
create index if not exists idx_conversation_members_user_active on conversation_members (user_id) where hidden_at is null;
create index if not exists idx_conversation_members_conversation_active on conversation_members (conversation_id) where hidden_at is null;
