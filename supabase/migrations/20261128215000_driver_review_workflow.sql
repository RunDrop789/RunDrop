alter table public.drivers
  add column if not exists review_notified_at timestamptz;

create table if not exists public.driver_review_sessions (
  admin_line_user_id text primary key,
  driver_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.driver_review_sessions enable row level security;
grant all on public.driver_review_sessions to service_role;
