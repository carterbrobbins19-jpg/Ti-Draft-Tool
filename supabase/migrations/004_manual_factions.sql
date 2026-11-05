-- New drafts no longer roll factions. The host records the physical coin flips.
-- A draft that is already revealed keeps its saved result.

create or replace function public.reveal_factions(p_draft_id uuid)
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
    raise exception 'Only the host can reveal factions';
  end if;
  if v_draft.status = 'revealed' then
    return jsonb_build_object('ok', true, 'already_revealed', true);
  end if;
  raise exception 'Faction assignments are recorded by the host after the physical coin flips';
end;
$fn$;

create or replace function public.record_faction_assignments(p_draft_id uuid, p_choices jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_draft public.drafts;
  v_choice jsonb;
  v_player public.players;
  v_seen uuid[] := '{}';
  v_factions uuid[];
  v_main uuid;
  v_slice uuid;
  v_position smallint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_draft.host_user_id <> auth.uid() then
    raise exception 'Only the host can record faction assignments';
  end if;
  if v_draft.status = 'revealed' then
    raise exception 'Faction assignments are already published';
  end if;
  if v_draft.status <> 'complete' then
    raise exception 'Finish the draft before recording faction assignments';
  end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) <> 6 then
    raise exception 'Record all six faction assignments together';
  end if;

  for v_choice in select value from jsonb_array_elements(p_choices)
  loop
    select * into v_player
    from public.players
    where id = (v_choice->>'player_id')::uuid
      and draft_id = p_draft_id;
    if not found then
      raise exception 'That player is not in this draft';
    end if;
    if v_player.id = any (v_seen) then
      raise exception 'Each player is recorded once';
    end if;
    v_seen := array_append(v_seen, v_player.id);

    select array_agg(faction_id order by pick_number) into v_factions
    from public.draft_picks
    where player_id = v_player.id and category = 'faction';
    if v_factions is null or array_length(v_factions, 1) <> 2 then
      raise exception 'Each player needs two factions';
    end if;

    v_main := (v_choice->>'main_faction_id')::uuid;
    if v_main is null or not (v_main = any (v_factions)) then
      raise exception 'The main faction must be one of that player''s drafted factions';
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

    update public.players
    set main_faction_id = v_main,
        minor_faction_id = case when v_factions[1] = v_main then v_factions[2] else v_factions[1] end,
        slice_id = v_slice,
        position_number = v_position
    where id = v_player.id;
  end loop;

  if (select count(*) from public.players where draft_id = p_draft_id) <> 6 then
    raise exception 'This table needs six players';
  end if;

  update public.drafts
  set status = 'revealed', revealed_at = now()
  where id = p_draft_id and status = 'complete';

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.record_faction_assignments(uuid, jsonb) from public;
grant execute on function public.record_faction_assignments(uuid, jsonb) to authenticated;
