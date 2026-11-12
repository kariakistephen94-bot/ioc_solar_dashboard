# OIC Solar: WhatsApp lead engine

Built for [OIC Solar](https://www.oicsolar.net/) (Ibadan, Oyo State) on the ScaleMatrix dashboard template.
It finds businesses that suffer from power cuts, messages them on WhatsApp from up to 4 numbers, follows up automatically,
and runs an OpenAI agent that chats, quotes shop prices and books site surveys. **No n8n. Supabase is the only database.**

```
dashboard (Next.js :3012)  ->  engine (Node :3310: 4 WhatsApp sessions, sender, agent)  ->  Supabase
```

## Cost
Supabase free tier, OpenStreetMap free, WhatsApp linked-device free, one Node process. You pay OpenAI (a short reply on
`gpt-4.1-mini` is a fraction of a naira) and, optionally, Google Places for lead volume.

## Setup (about 10 minutes)
1. **Supabase**: create a project, open *SQL Editor*, paste `supabase/schema.sql`, Run.
2. **Engine**: `cd engine && cp .env.example .env`. Fill `ENGINE_API_TOKEN` (any long random string), `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY` (service_role key, server only) and `OPENAI_API_KEY`. Then `npm install && npm start` (Node 22+).
   The OIC Solar product list (112 items with prices from oicsolar.net) loads automatically on first start.
3. **Staff logins** (Supabase Auth): keep *Authentication → Sign In / Providers → Allow new users to sign up* **on**. Put your own
   email(s) in `ADMIN_EMAILS` in `engine/.env`: those accounts are always admin. Optional: turn off *Confirm email* for instant
   sign-up, or leave it on so people confirm their address first. No database trigger is used: the dashboard records each
   person in the `staff` table the moment they sign up, so they appear in *Authentication → Users* and *Table Editor → staff*.
4. **Dashboard**: `cd dashboard && cp .env.local.example .env.local`. Set the same `ENGINE_API_TOKEN`, plus `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` (the anon/publishable key, never the service_role key). Then `npm install && npm run build && npm start` and open http://127.0.0.1:3012.
5. **WhatsApp**: *WhatsApp* tab -> **Link WhatsApp** on each number -> scan the QR (WhatsApp -> Linked devices).
6. **Leads**: *Leads* -> **Find leads** (choose areas) and/or **Import** a CSV.
7. **AI agent** tab: review the instructions, try it in the test chat, then press **Resume sending** on the WhatsApp page (it asks you to confirm). Sending starts paused.

## Prefilled leads
`engine/data/seed-leads.json` holds **476 real businesses** from OpenStreetMap across 57 areas (Lagos 130, Abuja 112, Enugu 58,
Jos 38 and more): hotels, clinics, restaurants, supermarkets, schools, offices. Each has a WhatsApp-ready phone number (468 mobile,
8 landline) and map coordinates. They load automatically into an empty database on first start, or via **Leads → Load prefilled**.
Refresh the list any time with `cd engine && npm run harvest`.

## Getting to 2,000+ leads
OpenStreetMap is free but thin in Nigeria: expect roughly 5 to 15 usable leads per area (18 from the first 3 areas tested).
To reach 2,000+, add `GOOGLE_MAPS_API_KEY` (Places API New) and run the Google search with a **Max API requests** cap and a **Stop after new leads** target (default 2,000)
(each request returns up to 20 businesses, 3 pages per query; the option unlocks once the key is set and the engine restarted), and/or import CSV lists from business directories.
Duplicates are removed by phone number; landline-only leads are kept as "call only".
Edit `engine/src/areas.js` to add neighbourhoods and `engine/src/sectors.js` to change which businesses count and how they score.

## How sending works
- Window 08:00-18:00 Lagos, Mon-Sat (Settings). Each number warms up: 15 messages on day 1, +10 a day, up to its cap (60).
- Random 1.5 to 7 minute gaps, a longer break every 8 to 14 sends, "typing..." before each message.
- Each lead is checked on WhatsApp first and contacted once. Every first message has an opt-out line; STOP (and Pidgin
  equivalents) removes the lead and stops the agent.
- **Follow-ups**: day 3 and day 7 if there is no reply, from the same number. A reply cancels them and the agent takes over.
  If a lead who replied goes quiet for 24 hours, the agent sends one nudge.
- **Automatic replies are not replies.** Away messages, greeting templates and chatbots are labelled *Auto-reply*: the lead
  stays *Contacted*, the follow-up stays scheduled and the agent says nothing. The engine weighs the read mark, how fast the
  reply came (counted from delivery), repeats, typing speed and the wording (one small OpenAI check), so people who hide read
  marks are still recognised. In *Conversations* you can overrule it either way (**Real person** / **Mark as auto-reply**);
  switch it off in *Settings → AI agent*. Rules live in `engine/src/autoreply.js`.
- **Agent**: replies after a human-like delay, quotes only prices from the product table, books surveys, flags hot leads
  (pings your own WhatsApp number if set in Settings) and hands over to you when it should not decide ("needs human").
  Sending a message yourself from *Conversations* pauses the agent for that lead.

## Dashboard
Overview, **Pipeline** (drag cards between stages), Leads, Conversations, **Calendar** (surveys and scheduled follow-ups, book or
reschedule), Follow-ups, WhatsApp (link numbers and **track each number's progress**: today vs warm-up cap, delivered/read/reply
rates, 14-day chart, conversion funnel), AI agent, Settings.

**Imole**, the dashboard assistant (bottom-right): ask "who needs my attention?", "surveys this week", "which number performs
best?", or tell it to "book Palm Grove for Saturday 10am" or "move Mercy Cold Room to won". It reads live data and makes changes
through the same engine API, and shows every change it made. The mascot is TypeScript + SVG (`dashboard/components/imole/`);
see all its moods at `/imole`.

The WhatsApp agent manages the pipeline on its own: replies move leads to *Replied*, interest to *Interested*, agreed times to
*Survey booked* (with the date on the calendar), "no thanks" to *Lost*, STOP to *Opted out*, and anything it should not decide to
*Needs you*. It only moves leads forward, never back.

## Security
- **Sign-in**: Supabase Auth email + password. The session is kept in HttpOnly, SameSite=Lax cookies (Secure on HTTPS) that page
  scripts cannot read, and it renews itself for up to 30 days. Signing out revokes it.
- **Every data request is checked on the server** (`dashboard/app/api/engine/`) before it is forwarded to the engine; requests
  from other websites are rejected. The engine only accepts the dashboard's secret `ENGINE_API_TOKEN`.
- **Roles**: anyone can create an account, but new accounts are **user** and only see a "waiting for approval" screen. Only
  **admins** can open the dashboard. Admins change anyone else's access on the **Team** page (admin, user, or blocked); nobody can
  change their own access, `ADMIN_EMAILS` owners always stay admin, and there is always at least one admin. Changes reach people
  who are already signed in within 30 seconds; blocked people are signed out. Every change is logged with who made it.
- The Team page shows your session, with **Sign out** and **Sign out on all devices**.
- `DASHBOARD_AUTH=off` exists only for a local demo without Supabase. Never set it on a deployed dashboard.
- Secrets (`SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `ENGINE_API_TOKEN`) stay on the servers and never reach the browser.

## Risks
- Linked-device WhatsApp is unofficial. Numbers used for cold outreach can be restricted. Use dedicated SIMs, keep caps modest,
  keep the phones online.
- Keep the engine running (small VPS or an always-on computer) or sessions go offline.
- Never commit `.env`: the service-role key bypasses Supabase security.

## Tests
`cd engine && npm test` (22 tests: phone parsing, scoring, discovery and dedupe, Google paging, follow-up schedule, warm-up,
send window, STOP handling, agent flow, automatic-reply screening).
