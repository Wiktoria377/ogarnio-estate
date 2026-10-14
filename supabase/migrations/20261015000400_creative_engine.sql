-- ETAP 4, faza 6: Creative Engine 2.0.
-- Techniczna analiza zdjęć (rozdzielczość, proporcje, jasność, kontrast,
-- ostrość, kolory dominujące, punkt uwagi, ryzyko kadrowania) zapisywana przy
-- zdjęciu. Zdjęcie nie jest modyfikowane; kadr to wyłącznie dane projektu grafiki.
alter table public.property_photos
  add column if not exists analysis jsonb check (analysis is null or pg_column_size(analysis) <= 8192),
  add column if not exists analyzed_at timestamptz;
