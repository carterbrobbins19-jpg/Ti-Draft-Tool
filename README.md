# TI4 Draft

A six-player draft for Twilight Imperium factions, map slices, and table positions. Each player drafts two factions, one slice, and one position in snake order. After the draft, the host reveals which faction is the main faction and which becomes the minor faction opposite that player's seat.

This is a small Next.js app. Supabase stores the draft, checks every pick, and pushes live updates. The anon key is the only key the browser uses. Do not put the service-role key in this project.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and fill in the project URL and anon key from Supabase → Project Settings → API:

```bash
copy .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the rule tests with:

```bash
npm test
```

## Supabase

Create a project, then do these steps in order.

### 1. Anonymous auth

In Authentication → Sign In / Providers, enable **Anonymous sign-ins**.

Players do not create email accounts. The first visit stores an anonymous session in the browser. That session is the seat identity. Clearing site data detaches the seat until the player opens their invite again, or until the host resets it.

### 2. Run the migration

Open the SQL editor and run `supabase/migrations/001_draft.sql`.

The script creates the tables, the pick function, row level security, and the realtime publication. Authenticated users can read a draft only when they host it or have claimed a seat. They cannot insert, update, or delete rows directly. Picks, seat claims, undo, pause, and the coin flip all go through database functions.

Important behavior inside `submit_pick`:

- The draft row is locked for the transaction, so two overlapping requests cannot both take the same faction, slice, or position, and cannot both advance the turn.
- The function decides whose turn it is. The browser cannot send another player's id.
- A player can draft at most two factions, one slice, and one position.
- `reveal_factions` rolls each player once with `random()` and stores the result. Calling it again does not reroll.

If the publication step prints a notice, open Database → Publications and enable Realtime for `drafts`, `players`, `factions`, `slices`, and `draft_picks`.

### 3. Keys

Use the anon public key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave the service-role key on the Supabase dashboard. This app never reads it.

## Play a draft

1. The host creates a table and can rename players, shuffle the snake order, edit factions, and import slices before starting.
2. Copy one invite link per player. Each link claims one seat for that browser.
3. Copy the host recovery link and keep it. Open it later if the host switches phones before the reveal.
4. Start the draft. Players may join after the start, but a seat cannot pick until its invite has been opened.
5. On your turn, choose a faction, slice, or position and confirm it. Everyone else's screen updates from Supabase Realtime. A backup refresh runs every 12 seconds.
6. When all 24 picks are in, the two factions stay unassigned.
7. On game day the host presses **Reveal factions**. Position 1 is opposite 4, 2 opposite 5, and 3 opposite 6. The minor faction is shown at the opposite position.

Slice JSON can be an array or `{ "slices": [ ... ] }`. Each slice accepts `name`, `planets` (names or `{ name, resources, influence, legendary }`), `resources` / `total_resources`, `influence` / `total_influence`, `notes`, and an optional `image` URL. See `examples/slices.example.json`. Placeholder slices are included so the draft can be tested before real slices are imported. There is no map generator.

Faction lines use `Name | Expansion | Image URL`.

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import it in Vercel as a Next.js project.
3. Add the same two environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.
5. In Supabase Authentication → URL configuration, add the Vercel domain if you later enable any redirect-based provider. Anonymous sign-in does not need a redirect.

Run the SQL migration before inviting players. A new Vercel deployment does not create the database.

## What version 1 leaves out

- Automatic slice or map generation
- Full Twilight Imperium rules, faction abilities, and a playable minor-faction board
- Accounts, email, chat, and matchmaking
- A live six-browser test against your Supabase project. The included tests cover the snake order, pick limits, duplicate protection, host-only reveal, and saved results. The database functions enforce those same rules for the real table.
