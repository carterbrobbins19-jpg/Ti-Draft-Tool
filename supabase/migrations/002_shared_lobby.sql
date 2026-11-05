-- Shared lobby codes, atomic seat claims, and ordered tile ids.
-- Run this after 001_draft.sql. It does not rebuild existing tables.

alter table public.drafts add column if not exists title text not null default 'TI4 Draft';
alter table public.drafts add column if not exists lobby_locked boolean not null default false;
alter table public.drafts drop constraint if exists drafts_title_length;
alter table public.drafts add constraint drafts_title_length check (char_length(title) between 1 and 80);

alter table public.slices add column if not exists tile_ids jsonb not null default '[]'::jsonb;
alter table public.slices drop constraint if exists slices_tile_ids_array;
alter table public.slices add constraint slices_tile_ids_array check (jsonb_typeof(tile_ids) = 'array');
alter table public.slices drop constraint if exists slices_total_resources_check;
alter table public.slices drop constraint if exists slices_total_influence_check;
alter table public.slices add constraint slices_total_resources_check check (total_resources between 0 and 120);
alter table public.slices add constraint slices_total_influence_check check (total_influence between 0 and 120);

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
      raise exception 'Each slice can list up to five tile numbers';
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

create or replace function public.create_draft(
  p_names jsonb,
  p_factions jsonb,
  p_slices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_draft_id uuid;
  v_code text := '';
  v_player_id uuid;
  v_token text;
  v_host_token text;
  v_index integer;
  v_name text;
  v_distinct integer;
  v_attempt integer;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  if jsonb_typeof(p_names) <> 'array' or jsonb_array_length(p_names) <> 6 then
    raise exception 'Exactly six player names are required';
  end if;
  select count(distinct lower(trim(value))) into v_distinct
  from jsonb_array_elements_text(p_names);
  if v_distinct <> 6 then
    raise exception 'Player names must be unique';
  end if;

  for v_attempt in 1..5 loop
    v_code := '';
    for v_index in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    begin
      insert into public.drafts (lobby_code, host_user_id)
      values (v_code, v_uid)
      returning id into v_draft_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise exception 'Could not create a lobby code. Try again.';
      end if;
    end;
  end loop;

  for v_index in 0..5 loop
    v_name := trim(coalesce(p_names->>v_index, ''));
    if char_length(v_name) < 1 or char_length(v_name) > 40 then
      raise exception 'Player names must be 1-40 characters';
    end if;
    insert into public.players (draft_id, seat_index, name, draft_order)
    values (v_draft_id, v_index + 1, v_name, v_index + 1)
    returning id into v_player_id;
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.seat_invites (player_id, draft_id, token)
    values (v_player_id, v_draft_id, v_token);
  end loop;

  v_host_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.host_credentials (draft_id, token) values (v_draft_id, v_host_token);
  perform public.replace_draft_catalog(v_draft_id, p_factions, p_slices);

  return jsonb_build_object(
    'draft_id', v_draft_id,
    'lobby_code', v_code,
    'host_token', v_host_token
  );
exception when unique_violation then
  raise exception 'Names must be unique within the draft';
end;
$fn$;

create or replace function public.claim_seat(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_player_id uuid;
  v_draft_id uuid;
  v_existing uuid;
  v_name text;
  v_code text;
  v_locked boolean;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  select player_id, draft_id into v_player_id, v_draft_id
  from public.seat_invites
  where token = p_token;
  if not found then
    raise exception 'Invite link not found';
  end if;

  select lobby_locked, status, lobby_code into v_locked, v_status, v_code
  from public.drafts
  where id = v_draft_id
  for update;

  select user_id, name into v_existing, v_name
  from public.players
  where id = v_player_id
  for update;

  if v_existing is not null and v_existing <> v_uid then
    raise exception 'This seat has already been claimed';
  end if;
  if v_existing is null and v_locked then
    raise exception 'The lobby is locked';
  end if;
  if v_existing is null and v_status in ('complete', 'revealed') then
    raise exception 'This draft is finished';
  end if;
  if exists (
    select 1 from public.players
    where draft_id = v_draft_id and user_id = v_uid and id <> v_player_id
  ) then
    raise exception 'You already claimed a seat in this draft';
  end if;

  update public.players set user_id = v_uid where id = v_player_id;
  return jsonb_build_object(
    'lobby_code', v_code,
    'player_id', v_player_id,
    'player_name', v_name
  );
exception when unique_violation then
  raise exception 'That seat is no longer available';
end;
$fn$;

create or replace function public.preview_lobby(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_draft public.drafts;
  v_players jsonb;
  v_mine uuid;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  select * into v_draft from public.drafts where lobby_code = upper(trim(p_code));
  if not found then
    raise exception 'No draft uses that room code';
  end if;
  select id into v_mine from public.players where draft_id = v_draft.id and user_id = v_uid;
  select coalesce(jsonb_agg(seat order by seat_index), '[]'::jsonb) into v_players
  from (
    select p.seat_index,
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'seat_index', p.seat_index,
        'claimed', p.user_id is not null,
        'mine', p.user_id = v_uid
      ) as seat
    from public.players p
    where p.draft_id = v_draft.id
  ) rows;
  return jsonb_build_object(
    'draft_id', v_draft.id,
    'title', v_draft.title,
    'lobby_code', v_draft.lobby_code,
    'status', v_draft.status,
    'lobby_locked', v_draft.lobby_locked,
    'is_host', v_draft.host_user_id = v_uid,
    'my_player_id', v_mine,
    'claimed_count', (select count(*) from public.players where draft_id = v_draft.id and user_id is not null),
    'players', v_players
  );
end;
$fn$;

create or replace function public.claim_lobby_seat(p_code text, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_draft public.drafts;
  v_player public.players;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  select * into v_draft
  from public.drafts
  where lobby_code = upper(trim(p_code))
  for update;
  if not found then
    raise exception 'No draft uses that room code';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id and draft_id = v_draft.id
  for update;
  if not found then
    raise exception 'That seat is not in this lobby';
  end if;
  if v_player.user_id is not null and v_player.user_id <> v_uid then
    raise exception 'This seat has already been claimed';
  end if;
  if v_player.user_id is null and v_draft.lobby_locked then
    raise exception 'The lobby is locked';
  end if;
  if v_player.user_id is null and v_draft.status in ('complete', 'revealed') then
    raise exception 'This draft is finished';
  end if;
  if exists (
    select 1 from public.players
    where draft_id = v_draft.id and user_id = v_uid and id <> v_player.id
  ) then
    raise exception 'You already claimed a seat in this draft';
  end if;

  update public.players set user_id = v_uid where id = v_player.id;
  return jsonb_build_object(
    'lobby_code', v_draft.lobby_code,
    'player_id', v_player.id,
    'player_name', v_player.name
  );
exception when unique_violation then
  raise exception 'That seat is no longer available';
end;
$fn$;

create or replace function public.set_lobby_locked(p_draft_id uuid, p_locked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_draft.host_user_id <> auth.uid() then
    raise exception 'Only the host can do that';
  end if;
  update public.drafts set lobby_locked = p_locked where id = p_draft_id;
  return jsonb_build_object('lobby_locked', p_locked);
end;
$fn$;

create or replace function public.set_draft_title(p_draft_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_host uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select host_user_id into v_host from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_host <> auth.uid() then
    raise exception 'Only the host can do that';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'The room name must be 1-80 characters';
  end if;
  update public.drafts set title = v_title where id = p_draft_id;
  return jsonb_build_object('title', v_title);
end;
$fn$;

revoke all on function public.preview_lobby(text) from public;
revoke all on function public.claim_lobby_seat(text, uuid) from public;
revoke all on function public.set_lobby_locked(uuid, boolean) from public;
revoke all on function public.set_draft_title(uuid, text) from public;
grant execute on function public.preview_lobby(text) to authenticated;
grant execute on function public.claim_lobby_seat(text, uuid) to authenticated;
grant execute on function public.set_lobby_locked(uuid, boolean) to authenticated;
grant execute on function public.set_draft_title(uuid, text) to authenticated;
