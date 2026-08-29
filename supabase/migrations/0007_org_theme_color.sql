-- Lets each org set its own brand accent color, applied via CSS custom
-- properties across the whole app. Safe to run against your existing
-- database — additive only.

alter table orgs
  add column if not exists theme_color text default '#1B6B4A';
