-- Four selectable system tiles per slice, plus two reserved homes that are not stored.
-- Run after 002_shared_lobby.sql. This does not rebuild tables or delete drafts, players, or picks.
-- A slice may store four system ids, or five ids from an older slice. Home systems are derived after the coin flip.

alter table public.slices drop constraint if exists slices_tile_ids_count;
alter table public.slices add constraint slices_tile_ids_count check (jsonb_array_length(tile_ids) <= 5);

create or replace function public.replace_draft_catalog(
  p_draft_id uuid,
  p_factions jsonb,
  p_slices jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status text;
  v_count integer;
  v_index integer;
  v_row jsonb;
  v_name text;
  v_image text;
  v_notes text;
  v_planets jsonb;
  v_resources integer;
  v_influence integer;
  v_tiles jsonb;
  v_tile text;
  v_tile_index integer;
  v_ids text[] := '{}';
  v_allow boolean := false;
begin
  select status into v_status from public.drafts where id = p_draft_id;
  if v_status is distinct from 'lobby' then
    raise exception 'The draft setup is locked';
  end if;
  if jsonb_typeof(p_factions) <> 'array'
    or jsonb_array_length(p_factions) < 12
    or jsonb_array_length(p_factions) > 40 then
    raise exception 'Choose between 12 and 40 factions';
  end if;
  if jsonb_typeof(p_slices) <> 'array'
    or jsonb_array_length(p_slices) < 6
    or jsonb_array_length(p_slices) > 12 then
    raise exception 'Choose between 6 and 12 slices';
  end if;

  update public.players
  set slice_id = null, position_number = null, main_faction_id = null, minor_faction_id = null
  where draft_id = p_draft_id;
  delete from public.draft_picks where draft_id = p_draft_id;
  delete from public.factions where draft_id = p_draft_id;
  delete from public.slices where draft_id = p_draft_id;

  for v_index in 0..jsonb_array_length(p_factions) - 1 loop
    v_row := p_factions -> v_index;
    v_name := trim(coalesce(v_row->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Each faction needs a name of 1-80 characters';
    end if;
    v_image := nullif(trim(coalesce(v_row->>'image_url', '')), '');
    if v_image is not null and (v_image !~* '^https?://' or char_length(v_image) > 500) then
      raise exception 'Faction image URLs must start with http:// or https://';
    end if;
    insert into public.factions (draft_id, name, image_url, expansion, sort_order)
    values (
      p_draft_id,
      v_name,
      v_image,
      nullif(trim(coalesce(v_row->>'expansion', '')), ''),
      v_index
    );
  end loop;

  for v_index in 0..jsonb_array_length(p_slices) - 1 loop
    v_row := p_slices -> v_index;
    v_name := trim(coalesce(v_row->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Each slice needs a name of 1-80 characters';
    end if;
    v_image := nullif(trim(coalesce(v_row->>'image_url', '')), '');
    if v_image is not null and (v_image !~* '^https?://' or char_length(v_image) > 500) then
      raise exception 'Slice image URLs must start with http:// or https://';
    end if;
    if jsonb_typeof(coalesce(v_row->'planets', '[]'::jsonb)) <> 'array' then
      raise exception 'Slice planets must be a list of names';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_row->'planets', '[]'::jsonb)) element
      where jsonb_typeof(element) <> 'string'
    ) then
      raise exception 'Slice planets must be a list of names';
    end if;
    select coalesce(jsonb_agg(to_jsonb(trimmed) order by ord), '[]'::jsonb) into v_planets
    from (
      select trim(element #>> '{}') as trimmed, ord
      from jsonb_array_elements(coalesce(v_row->'planets', '[]'::jsonb)) with ordinality as planet(element, ord)
      where char_length(trim(element #>> '{}')) > 0
    ) planets;
    if coalesce(v_row->>'total_resources', '') !~ '^[0-9]+$'
      or coalesce(v_row->>'total_influence', '') !~ '^[0-9]+$' then
      raise exception 'Slice resources and influence must be whole numbers';
    end if;
    v_resources := (v_row->>'total_resources')::integer;
    v_influence := (v_row->>'total_influence')::integer;
    if v_resources > 120 or v_influence > 120 then
      raise exception 'Slice resources or influence are too large';
    end if;
    v_notes := nullif(trim(coalesce(v_row->>'special_notes', '')), '');
    if v_notes is not null and char_length(v_notes) > 800 then
      raise exception 'Slice notes must be 800 characters or fewer';
    end if;
    v_tiles := coalesce(v_row->'tile_ids', '[]'::jsonb);
    if jsonb_typeof(v_tiles) <> 'array' or jsonb_array_length(v_tiles) > 5 then
      raise exception 'Each slice lists four system tiles. An older slice may still list five. More than five is not saved';
    end if;
    if coalesce(v_row->>'allow_duplicate_tiles', '') = 'true' then
      v_allow := true;
    end if;
    for v_tile_index in 0..jsonb_array_length(v_tiles) - 1 loop
      if jsonb_typeof(v_tiles->v_tile_index) <> 'string' then
        raise exception 'Tile numbers must be text';
      end if;
      v_tile := upper(trim(v_tiles->>v_tile_index));
      if v_tile <> '' and v_tile !~ '^[0-9A-Z]{1,8}$' then
        raise exception 'Tile numbers must be letters and digits, such as 35 or 83A';
      end if;
      v_tiles := jsonb_set(v_tiles, array[v_tile_index::text], to_jsonb(v_tile));
      if v_tile <> '' then
        v_ids := array_append(v_ids, v_tile);
      end if;
    end loop;
    insert into public.slices (
      draft_id, name, image_url, planets, total_resources, total_influence, special_notes, sort_order, tile_ids
    ) values (
      p_draft_id, v_name, v_image, v_planets, v_resources, v_influence, v_notes, v_index, v_tiles
    );
  end loop;

  if not v_allow and exists (
    select 1 from unnest(v_ids) as tile_id group by tile_id having count(*) > 1
  ) then
    raise exception 'The same system tile is in more than one slice';
  end if;

  select count(*) into v_count from public.factions where draft_id = p_draft_id;
  if v_count < 12 then
    raise exception 'Choose between 12 and 40 factions';
  end if;
end;
$fn$;
