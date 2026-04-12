-- Engagement tracking columns for dashboard streak, NPS and milestone state.
-- Replaces per-device localStorage so multi-device users share the same state.

alter table profiles add column if not exists streak_count         integer      not null default 0;
alter table profiles add column if not exists streak_last_visit_date date;
alter table profiles add column if not exists streak_7_shown       boolean      not null default false;
alter table profiles add column if not exists streak_30_shown      boolean      not null default false;
alter table profiles add column if not exists nps_shown_at         timestamptz;
alter table profiles add column if not exists milestone_1k_shown   boolean      not null default false;

-- Allow users to update only their own engagement columns (RLS already covers row-level)
comment on column profiles.streak_count           is 'Consecutive days the user has opened the dashboard.';
comment on column profiles.streak_last_visit_date is 'Date (UTC) of the last dashboard visit for streak calculation.';
comment on column profiles.streak_7_shown         is 'Whether the 7-day streak milestone toast has been shown.';
comment on column profiles.streak_30_shown        is 'Whether the 30-day streak milestone toast has been shown.';
comment on column profiles.nps_shown_at           is 'When the NPS survey was last shown to this user (null = never).';
comment on column profiles.milestone_1k_shown     is 'Whether the first R$1k recovered milestone toast has been shown.';
