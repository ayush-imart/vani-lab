-- Synthetic local-dev seed only (supabase db reset applies it). No real customer data.
insert into public.versions (id, data) values
  ('A', '{"id":"A","label":"Baseline","slot":"A","promptText":"Placeholder prompt for version A.","changelog":"Seed version (placeholder).","createdAt":"2026-10-09T00:00:00.000Z"}'),
  ('B', '{"id":"B","label":"Challenger B","slot":"B","promptText":"Placeholder prompt for version B.","changelog":"Seed version (placeholder).","createdAt":"2026-10-09T00:00:00.000Z"}'),
  ('C', '{"id":"C","label":"Challenger C","slot":"C","promptText":"Placeholder prompt for version C.","changelog":"Seed version (placeholder).","createdAt":"2026-10-09T00:00:00.000Z"}');

insert into public.rubrics (id, data) values
  ('active', '{"id":"active","primaryMetric":"meetingFixed","weights":{"meetingFixed":0.4,"callDuration":0.15,"answerRate":0.15,"locationConfirmed":0.15,"callbackRequested":0.15},"guardrails":["no_abusive_language","no_false_claims","no_pii_requested"],"updatedAt":"2026-10-09T00:00:00.000Z"}');

insert into public.traffic_allocations (id, data) values ('current', '{"id":"current","A":50,"B":25,"C":25}');
insert into public.autoscale_settings (id, data) values
  ('current', '{"id":"current","autoscale":true,"riskAppetite":"moderate","thresholdPct":12}');
insert into public.notification_preferences (id, data) values
  ('default', '{"id":"default","inApp":true,"gchat":false,"whatsapp":false}');

-- Synthetic calls (masked GLID tails only).
insert into public.calls (id, data) values
  ('call_seed_1', '{"id":"call_seed_1","glidLast5":"00011","cohort":1,"version":"A","at":1791500000000,"durationSec":62,"outcome":{"answered":true,"meetingFixed":false,"locationConfirmed":true,"callbackRequested":false}}'),
  ('call_seed_2', '{"id":"call_seed_2","glidLast5":"00022","cohort":2,"version":"B","at":1791500001000,"durationSec":88,"outcome":{"answered":true,"meetingFixed":true,"locationConfirmed":true,"callbackRequested":false}}');
