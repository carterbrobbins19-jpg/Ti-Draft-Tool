-- TI4 six-player draft.
-- Apply this file in the Supabase SQL editor, or with the Supabase CLI.
-- Authenticated players can read a draft they host or have claimed.
-- Every mutation goes through a security-definer function. Direct writes are revoked.

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  lobby_code text not null unique,
  host_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'paused', 'complete', 'revealed')),
  next_pick smallint not null default 1,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  constraint drafts_reveal_pair check ((status = 'revealed') = (revealed_at is not null)),
  constraint drafts_pick_cursor check (
    (status in ('lobby', 'active', 'paused') and next_pick between 1 and 24)
    or (status in ('complete', 'revealed') and next_pick = 25)
  )
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  seat_index smallint not null check (seat_index between 1 and 6),
  name text not null check (char_length(name) between 1 and 80),
  draft_order smallint not null check (draft_order between 1 and 12),
  user_id uuid references auth.users (id) on delete set null,
  slice_id uuid,
  position_number smallint check (position_number between 1 and 6),
  main_faction_id uuid,
  minor_faction_id uuid,
  unique (draft_id, seat_index),
  unique (draft_id, draft_order)
);

create table public.factions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  image_url text,
  expansion text,
  sort_order smallint not null default 0
);

create table public.slices (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  image_url text,
  planets jsonb not null default '[]'::jsonb,
  total_resources smallint not null default 0 check (total_resources between 0 and 40),
  total_influence smallint not null default 0 check (total_influence between 0 and 40),
  special_notes text,
  sort_order smallint not null default 0
);

alter table public.players
  add constraint players_slice_fk foreign key (slice_id) references public.slices (id),
  add constraint players_main_faction_fk foreign key (main_faction_id) references public.factions (id),
  add constraint players_minor_faction_fk foreign key (minor_faction_id) references public.factions (id);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  pick_number smallint not null check (pick_number between 1 and 24),
  category text not null check (category in ('faction', 'slice', 'position')),
  faction_id uuid references public.factions (id),
  slice_id uuid references public.slices (id),
  position_number smallint check (position_number between 1 and 6),
  created_at timestamptz not null default now(),
  unique (draft_id, pick_number),
  constraint draft_picks_payload check (
    (category = 'faction' and faction_id is not null and slice_id is null and position_number is null)
    or (category = 'slice' and slice_id is not null and faction_id is null and position_number is null)
    or (category = 'position' and position_number is not null and faction_id is null and slice_id is null)
  )
);

create unique index draft_picks_faction_uidx on public.draft_picks (draft_id, faction_id) where faction_id is not null;
create unique index draft_picks_slice_uidx on public.draft_picks (draft_id, slice_id) where slice_id is not null;
create unique index draft_picks_position_uidx on public.draft_picks (draft_id, position_number) where position_number is not null;
create unique index players_name_uidx on public.players (draft_id, lower(name));
create unique index players_user_uidx on public.players (draft_id, user_id) where user_id is not null;
create unique index players_position_uidx on public.players (draft_id, position_number) where position_number is not null;
create unique index players_slice_uidx on public.players (draft_id, slice_id) where slice_id is not null;
create index players_user_lookup_idx on public.players (user_id);
create unique index factions_name_uidx on public.factions (draft_id, lower(name));
create unique index slices_name_uidx on public.slices (draft_id, lower(name));

create table public.seat_invites (
  player_id uuid primary key references public.players (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32)
);

create index seat_invites_draft_idx on public.seat_invites (draft_id);

create table public.host_credentials (
  draft_id uuid primary key references public.drafts (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32)
);

create or replace function public.snake_draft_order(p_pick integer)
returns integer
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_round integer;
  v_index integer;
begin
  if p_pick < 1 or p_pick > 24 then
    raise exception 'Pick number must be between 1 and 24';
  end if;
  v_round := ceil(p_pick / 6.0);
  v_index := (p_pick - 1) % 6;
  if v_round % 2 = 1 then
    return v_index + 1;
  end if;
  return 6 - v_index;
end;
$fn$;

create or replace function public.opposite_position(p_position integer)
returns integer
language sql
immutable
set search_path = public
as $fn$
  select case p_position
    when 1 then 4
    when 2 then 5
    when 3 then 6
    when 4 then 1
    when 5 then 2
    when 6 then 3
    else null
  end;
$fn$;

create or replace function public.is_draft_participant(p_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() is not null and (
    exists (
      select 1 from public.drafts d
      where d.id = p_draft_id and d.host_user_id = auth.uid()
    )
    or exists (
      select 1 from public.players p
      where p.draft_id = p_draft_id and p.user_id = auth.uid()
    )
  );
$fn$;

create or replace function public.draft_picks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status text;
  v_next integer;
  v_order integer;
  v_player_user uuid;
  v_player_order integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select status, next_pick into v_status, v_next
  from public.drafts
  where id = new.draft_id;

  if v_status is distinct from 'active' then
    raise exception 'The draft is not accepting picks';
  end if;
  if new.pick_number is distinct from v_next then
    raise exception 'That pick is out of order';
  end if;

  v_order := public.snake_draft_order(new.pick_number);

  select user_id, draft_order into v_player_user, v_player_order
  from public.players
  where id = new.player_id and draft_id = new.draft_id;

  if v_player_order is null then
    raise exception 'Player is not in this draft';
  end if;
  if v_player_order <> v_order or new.player_id is null then
    raise exception 'You cannot pick for another player';
  end if;
  if v_player_user is null then
    raise exception 'This seat has not been claimed yet';
  end if;
  if v_player_user is distinct from auth.uid() then
    raise exception 'It is not your turn';
  end if;

  if new.category = 'faction' then
    select count(*) into v_count
    from public.draft_picks
    where player_id = new.player_id and category = 'faction';
    if v_count >= 2 then
      raise exception 'You already drafted two factions';
    end if;
    if not exists (
      select 1 from public.factions where id = new.faction_id and draft_id = new.draft_id
    ) then
      raise exception 'That faction is not available';
    end if;
    if exists (
      select 1 from public.draft_picks where draft_id = new.draft_id and faction_id = new.faction_id
    ) then
      raise exception 'That faction has already been drafted';
    end if;
  elsif new.category = 'slice' then
    if exists (
      select 1 from public.draft_picks where player_id = new.player_id and category = 'slice'
    ) then
      raise exception 'You already drafted a slice';
    end if;
    if not exists (
      select 1 from public.slices where id = new.slice_id and draft_id = new.draft_id
    ) then
      raise exception 'That slice is not available';
    end if;
    if exists (
      select 1 from public.draft_picks where draft_id = new.draft_id and slice_id = new.slice_id
    ) then
      raise exception 'That slice has already been drafted';
    end if;
  elsif new.category = 'position' then
    if new.position_number is null or new.position_number < 1 or new.position_number > 6 then
      raise exception 'Position must be 1 through 6';
    end if;
    if exists (
      select 1 from public.draft_picks where player_id = new.player_id and category = 'position'
    ) then
      raise exception 'You already drafted a position';
    end if;
    if exists (
      select 1 from public.draft_picks
      where draft_id = new.draft_id and position_number = new.position_number
    ) then
      raise exception 'That position has already been drafted';
    end if;
  else
    raise exception 'Unknown draft category';
  end if;

  return new;
end;
$fn$;

create trigger draft_picks_before_insert
before insert on public.draft_picks
for each row execute function public.draft_picks_guard();

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
    if v_resources > 40 or v_influence > 40 then
      raise exception 'Slice resources or influence are too large';
    end if;
    v_notes := nullif(trim(coalesce(v_row->>'special_notes', '')), '');
    if v_notes is not null and char_length(v_notes) > 400 then
      raise exception 'Slice notes must be 400 characters or fewer';
    end if;
    insert into public.slices (
      draft_id, name, image_url, planets, total_resources, total_influence, special_notes, sort_order
    ) values (
      p_draft_id, v_name, v_image, v_planets, v_resources, v_influence, v_notes, v_index
    );
  end loop;

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
  v_code text;
  v_player_id uuid;
  v_token text;
  v_host_token text;
  v_index integer;
  v_name text;
  v_distinct integer;
  v_attempt integer;
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
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
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

create or replace function public.update_setup(
  p_draft_id uuid,
  p_players jsonb,
  p_factions jsonb,
  p_slices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_index integer;
  v_id uuid;
  v_name text;
  v_distinct integer;
  v_matched integer;
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
  if v_draft.status <> 'lobby' then
    raise exception 'The draft setup is locked';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 6 then
    raise exception 'Exactly six players are required';
  end if;

  select count(distinct value->>'id') into v_distinct
  from jsonb_array_elements(p_players);
  if v_distinct <> 6 then
    raise exception 'Player list does not match this draft';
  end if;
  select count(*) into v_matched
  from jsonb_array_elements(p_players) element
  join public.players p on p.id = (element.value->>'id')::uuid and p.draft_id = p_draft_id;
  if v_matched <> 6 then
    raise exception 'Player list does not match this draft';
  end if;
  select count(distinct lower(trim(value->>'name'))) into v_distinct
  from jsonb_array_elements(p_players);
  if v_distinct <> 6 then
    raise exception 'Player names must be unique';
  end if;

  update public.players
  set draft_order = draft_order + 6,
      name = id::text
  where draft_id = p_draft_id;

  for v_index in 0..5 loop
    v_id := (p_players->v_index->>'id')::uuid;
    v_name := trim(coalesce(p_players->v_index->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 40 then
      raise exception 'Player names must be 1-40 characters';
    end if;
    update public.players
    set name = v_name, draft_order = v_index + 1
    where id = v_id and draft_id = p_draft_id;
  end loop;

  if exists (
    select 1 from public.players where draft_id = p_draft_id and (draft_order < 1 or draft_order > 6)
  ) then
    raise exception 'Player list does not match this draft';
  end if;

  perform public.replace_draft_catalog(p_draft_id, p_factions, p_slices);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'Names must be unique within the draft';
  when invalid_text_representation then
    raise exception 'Player list does not match this draft';
end;
$fn$;

create or replace function public.preview_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select d.lobby_code, d.status, p.name, p.seat_index, p.user_id
  into v_row
  from public.seat_invites s
  join public.players p on p.id = s.player_id
  join public.drafts d on d.id = s.draft_id
  where s.token = p_token;
  if not found then
    raise exception 'Invite link not found';
  end if;
  return jsonb_build_object(
    'lobby_code', v_row.lobby_code,
    'player_name', v_row.name,
    'seat_index', v_row.seat_index,
    'claimed', v_row.user_id is not null,
    'status', v_row.status
  );
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
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  select player_id, draft_id into v_player_id, v_draft_id
  from public.seat_invites
  where token = p_token
  for update;
  if not found then
    raise exception 'Invite link not found';
  end if;

  select user_id, name into v_existing, v_name
  from public.players
  where id = v_player_id
  for update;

  if v_existing is not null and v_existing <> v_uid then
    raise exception 'This seat has already been claimed';
  end if;
  if exists (
    select 1 from public.players
    where draft_id = v_draft_id and user_id = v_uid and id <> v_player_id
  ) then
    raise exception 'You already claimed a seat in this draft';
  end if;

  update public.players set user_id = v_uid where id = v_player_id;
  select lobby_code into v_code from public.drafts where id = v_draft_id;
  return jsonb_build_object(
    'lobby_code', v_code,
    'player_id', v_player_id,
    'player_name', v_name
  );
end;
$fn$;

create or replace function public.claim_host(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select draft_id into v_draft_id
  from public.host_credentials
  where token = p_token
  for update;
  if not found then
    raise exception 'Host link not found';
  end if;
  update public.drafts set host_user_id = auth.uid() where id = v_draft_id;
  select lobby_code into v_code from public.drafts where id = v_draft_id;
  return jsonb_build_object('lobby_code', v_code);
end;
$fn$;

create or replace function public.get_host_secrets(p_draft_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_host uuid;
  v_token text;
  v_invites jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select host_user_id into v_host from public.drafts where id = p_draft_id;
  if v_host is null then
    raise exception 'Draft not found';
  end if;
  if v_host <> auth.uid() then
    raise exception 'Only the host can do that';
  end if;
  select token into v_token from public.host_credentials where draft_id = p_draft_id;
  select coalesce(jsonb_agg(invite order by seat_index), '[]'::jsonb) into v_invites
  from (
    select p.seat_index,
      jsonb_build_object(
        'player_id', p.id,
        'name', p.name,
        'seat_index', p.seat_index,
        'token', s.token,
        'claimed', p.user_id is not null
      ) as invite
    from public.players p
    join public.seat_invites s on s.player_id = p.id
    where p.draft_id = p_draft_id
  ) rows;
  return jsonb_build_object('host_token', v_token, 'invites', v_invites);
end;
$fn$;

create or replace function public.reset_seat(p_draft_id uuid, p_player_id uuid)
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
  update public.players
  set user_id = null
  where id = p_player_id and draft_id = p_draft_id;
  if not found then
    raise exception 'Player not found';
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.start_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_factions integer;
  v_slices integer;
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
  if v_draft.status <> 'lobby' then
    raise exception 'The draft has already started';
  end if;
  select count(*) into v_factions from public.factions where draft_id = p_draft_id;
  select count(*) into v_slices from public.slices where draft_id = p_draft_id;
  if v_factions < 12 then
    raise exception 'Choose between 12 and 40 factions';
  end if;
  if v_slices < 6 then
    raise exception 'Choose between 6 and 12 slices';
  end if;
  update public.drafts set status = 'active', next_pick = 1 where id = p_draft_id;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.set_paused(p_draft_id uuid, p_paused boolean)
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
  if p_paused then
    if v_draft.status <> 'active' then
      raise exception 'Only a live draft can be paused';
    end if;
    update public.drafts set status = 'paused' where id = p_draft_id;
  else
    if v_draft.status <> 'paused' then
      raise exception 'The draft is not paused';
    end if;
    update public.drafts set status = 'active' where id = p_draft_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.submit_pick(
  p_draft_id uuid,
  p_category text,
  p_item text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_order integer;
  v_player_id uuid;
  v_faction uuid;
  v_slice uuid;
  v_position smallint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_category not in ('faction', 'slice', 'position') then
    raise exception 'Unknown draft category';
  end if;

  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_draft.status = 'paused' then
    raise exception 'The draft is paused';
  end if;
  if v_draft.status = 'lobby' then
    raise exception 'The draft has not started';
  end if;
  if v_draft.status <> 'active' then
    raise exception 'The draft is finished';
  end if;

  v_order := public.snake_draft_order(v_draft.next_pick);
  select id into v_player_id
  from public.players
  where draft_id = p_draft_id and draft_order = v_order;
  if v_player_id is null then
    raise exception 'The current seat is missing';
  end if;

  if p_category = 'faction' then
    v_faction := p_item::uuid;
  elsif p_category = 'slice' then
    v_slice := p_item::uuid;
  else
    if p_item !~ '^[1-6]$' then
      raise exception 'Position must be 1 through 6';
    end if;
    v_position := p_item::smallint;
  end if;

  insert into public.draft_picks (
    draft_id, player_id, pick_number, category, faction_id, slice_id, position_number
  ) values (
    p_draft_id,
    v_player_id,
    v_draft.next_pick,
    p_category,
    case when p_category = 'faction' then v_faction else null end,
    case when p_category = 'slice' then v_slice else null end,
    case when p_category = 'position' then v_position else null end
  );

  if p_category = 'slice' then
    update public.players set slice_id = v_slice where id = v_player_id;
  elsif p_category = 'position' then
    update public.players set position_number = v_position where id = v_player_id;
  end if;

  if v_draft.next_pick = 24 then
    update public.drafts set status = 'complete', next_pick = 25 where id = p_draft_id;
  else
    update public.drafts set next_pick = v_draft.next_pick + 1 where id = p_draft_id;
  end if;

  return jsonb_build_object('ok', true, 'pick_number', v_draft.next_pick);
exception
  when unique_violation then
    raise exception 'That selection conflicts with another pick. Try again.';
  when invalid_text_representation then
    raise exception 'That selection is not available';
end;
$fn$;

create or replace function public.undo_last_pick(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_pick public.draft_picks;
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
  if v_draft.status = 'revealed' then
    raise exception 'Revealed results cannot be undone';
  end if;
  if v_draft.status = 'lobby' then
    raise exception 'Nothing to undo';
  end if;

  select * into v_pick
  from public.draft_picks
  where draft_id = p_draft_id
  order by pick_number desc
  limit 1
  for update;
  if not found then
    raise exception 'Nothing to undo';
  end if;

  if v_pick.category = 'slice' then
    update public.players set slice_id = null where id = v_pick.player_id;
  elsif v_pick.category = 'position' then
    update public.players set position_number = null where id = v_pick.player_id;
  end if;
  delete from public.draft_picks where id = v_pick.id;

  update public.drafts
  set status = case when status = 'paused' then 'paused' else 'active' end,
      next_pick = v_pick.pick_number
  where id = p_draft_id;

  return jsonb_build_object('ok', true, 'pick_number', v_pick.pick_number);
end;
$fn$;

create or replace function public.reveal_factions(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_player public.players;
  v_factions uuid[];
  v_slice uuid;
  v_position smallint;
  v_main uuid;
  v_minor uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_draft.host_user_id <> auth.uid() then
    raise exception 'Only the host can reveal factions';
  end if;
  if v_draft.status = 'revealed' then
    return jsonb_build_object('ok', true, 'already_revealed', true);
  end if;
  if v_draft.status <> 'complete' then
    raise exception 'Finish the draft before revealing';
  end if;

  for v_player in
    select * from public.players where draft_id = p_draft_id order by draft_order
  loop
    select array_agg(faction_id order by pick_number) into v_factions
    from public.draft_picks
    where player_id = v_player.id and category = 'faction';
    if v_factions is null or array_length(v_factions, 1) <> 2 then
      raise exception 'Each player needs two factions';
    end if;

    select slice_id into v_slice
    from public.draft_picks
    where player_id = v_player.id and category = 'slice';
    select position_number into v_position
    from public.draft_picks
    where player_id = v_player.id and category = 'position';
    if v_slice is null or v_position is null then
      raise exception 'The draft is incomplete';
    end if;

    if random() < 0.5 then
      v_main := v_factions[1];
      v_minor := v_factions[2];
    else
      v_main := v_factions[2];
      v_minor := v_factions[1];
    end if;

    update public.players
    set main_faction_id = v_main,
        minor_faction_id = v_minor,
        slice_id = v_slice,
        position_number = v_position
    where id = v_player.id;
  end loop;

  update public.drafts
  set status = 'revealed', revealed_at = now()
  where id = p_draft_id and status = 'complete';

  return jsonb_build_object('ok', true, 'already_revealed', false);
end;
$fn$;

revoke all on public.drafts, public.players, public.factions, public.slices, public.draft_picks, public.seat_invites, public.host_credentials from public, anon, authenticated;
grant select on public.drafts, public.players, public.factions, public.slices, public.draft_picks to authenticated;

alter table public.drafts enable row level security;
alter table public.players enable row level security;
alter table public.factions enable row level security;
alter table public.slices enable row level security;
alter table public.draft_picks enable row level security;
alter table public.seat_invites enable row level security;
alter table public.host_credentials enable row level security;

create policy drafts_select on public.drafts
for select to authenticated
using (public.is_draft_participant(id));

create policy players_select on public.players
for select to authenticated
using (public.is_draft_participant(draft_id));

create policy factions_select on public.factions
for select to authenticated
using (public.is_draft_participant(draft_id));

create policy slices_select on public.slices
for select to authenticated
using (public.is_draft_participant(draft_id));

create policy draft_picks_select on public.draft_picks
for select to authenticated
using (public.is_draft_participant(draft_id));

revoke all on function public.snake_draft_order(integer) from public;
revoke all on function public.opposite_position(integer) from public;
revoke all on function public.is_draft_participant(uuid) from public;
revoke all on function public.draft_picks_guard() from public;
revoke all on function public.replace_draft_catalog(uuid, jsonb, jsonb) from public;
revoke all on function public.create_draft(jsonb, jsonb, jsonb) from public;
revoke all on function public.update_setup(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.preview_invite(text) from public;
revoke all on function public.claim_seat(text) from public;
revoke all on function public.claim_host(text) from public;
revoke all on function public.get_host_secrets(uuid) from public;
revoke all on function public.reset_seat(uuid, uuid) from public;
revoke all on function public.start_draft(uuid) from public;
revoke all on function public.set_paused(uuid, boolean) from public;
revoke all on function public.submit_pick(uuid, text, text) from public;
revoke all on function public.undo_last_pick(uuid) from public;
revoke all on function public.reveal_factions(uuid) from public;

grant execute on function public.is_draft_participant(uuid) to authenticated;
grant execute on function public.draft_picks_guard() to authenticated;
grant execute on function public.create_draft(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_setup(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.claim_seat(text) to authenticated;
grant execute on function public.claim_host(text) to authenticated;
grant execute on function public.get_host_secrets(uuid) to authenticated;
grant execute on function public.reset_seat(uuid, uuid) to authenticated;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.set_paused(uuid, boolean) to authenticated;
grant execute on function public.submit_pick(uuid, text, text) to authenticated;
grant execute on function public.undo_last_pick(uuid) to authenticated;
grant execute on function public.reveal_factions(uuid) to authenticated;

alter table public.drafts replica identity full;
alter table public.players replica identity full;
alter table public.factions replica identity full;
alter table public.slices replica identity full;
alter table public.draft_picks replica identity full;

do $pub$
declare
  table_name text;
begin
  foreach table_name in array array['drafts', 'players', 'factions', 'slices', 'draft_picks']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then null;
      when undefined_object then
        raise notice 'supabase_realtime publication was not found. Enable Realtime for drafts, players, factions, slices, and draft_picks.';
    end;
  end loop;
end
$pub$;
