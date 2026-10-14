-- ETAP 4, faza 7: kontrola jakości tekstu, grafiki i wideo.
-- Ostatni raport kontroli materiału (dla wersji `qa_version`). Raport zapisuje
-- wyłącznie serwer (klient nie może go podmienić ani „poprawić”).
alter table public.content_items
  add column if not exists qa jsonb check (qa is null or octet_length(qa::text) <= 65536),
  add column if not exists qa_version integer,
  add column if not exists qa_at timestamptz;

create or replace function public.content_items_qa_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.qa is distinct from old.qa or new.qa_version is distinct from old.qa_version or new.qa_at is distinct from old.qa_at then
      raise exception 'Raport kontroli jakości zapisuje tylko serwer' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists content_items_qa_guard on public.content_items;
create trigger content_items_qa_guard before update on public.content_items
  for each row execute function public.content_items_qa_guard();
