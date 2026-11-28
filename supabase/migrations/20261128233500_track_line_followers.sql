create table if not exists public.line_followers (
  line_user_id text primary key,
  is_following boolean not null,
  updated_at timestamptz not null default now()
);

alter table public.line_followers enable row level security;
revoke all on public.line_followers from anon, authenticated;
grant all on public.line_followers to service_role;
