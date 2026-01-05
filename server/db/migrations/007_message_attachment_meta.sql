alter table messages
  add column if not exists attachment_meta jsonb;
