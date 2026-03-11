# Supply Chain Resilience Game

A Firebase-backed classroom game for teaching supply-chain resilience under disruption. Instructors create sessions, students join with a code, place sourcing orders each round, and compete on cash, demand, and resilience outcomes.

## Stack

- `React 19` + `Vite` for the client
- `Firebase Authentication`
  - instructors/admins use email + password
  - players use anonymous auth with per-tab session persistence so one browser can simulate multiple students
- `Cloud Firestore` for live game state
- `Cloud Functions` for all authoritative game writes and round processing

## Local Development

### Prerequisites

- Node.js 20+
- Firebase project credentials in a local `.env`
- Firebase CLI if you want to run emulators or deploy

### Install

```bash
npm install
cd functions
npm install
cd ..
```

### Client

```bash
npm run dev
```

Host-bound scripts are also available for the Codex sandbox and local browser tooling:

```bash
npm run dev:host
npm run preview:host
```

### Typecheck and Lint

```bash
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p functions/tsconfig.json --noEmit
```

### Build

```bash
npm run build
cd functions
npm run build
```

## Emulator Workflow

Use the Firebase emulators when changing rules, auth flows, or callable behavior.

Recommended local loop:

1. Start Firebase emulators for Auth, Firestore, and Functions.
2. Set `VITE_USE_EMULATORS=true` in your local environment.
3. Run the client with `npm run dev`.
4. Exercise instructor flows and multi-tab player joins from separate tabs.

The client automatically connects to the local emulators when `VITE_USE_EMULATORS=true`.

## Required Environment Variables

Client `.env` values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_EMAIL`
- `VITE_USE_EMULATORS`

Functions config / params:

- `ADMIN_EMAIL`
- `SMTP2GO_API_KEY` (optional; email notifications are skipped if missing)

## Firestore Data Model

Hot session state is split to reduce contention and read amplification:

- `sessions/{sessionId}`
  - query-friendly session metadata and summary state
- `sessions/{sessionId}/state/public`
  - live player-visible state: status, round, phase, disruptions, submitted count, player count
- `sessions/{sessionId}/state/instructor`
  - instructor-only live state: submitted player IDs, supplier capacities
- `sessions/{sessionId}/players/{playerId}`
  - roster entry plus compact instructor leaderboard fields
- `sessions/{sessionId}/members/{authUid}`
  - auth-to-player mapping used by Firestore rules
- `sessions/{sessionId}/playerStates/{playerId}`
  - full per-player game state and round history
- `sessions/{sessionId}/rounds/{round}/orders/{playerId}`
  - submitted orders for that round

## Cost and Scaling Guidance

This project is tuned for free-tier awareness and 100+ concurrent students, but Firestore cost still depends on how you operate it.

### Important design choices already in place

- Player clients do not live-subscribe to the full session document.
- Instructor-only submission detail and supplier capacity live in a separate doc.
- Player roster data is no longer stored as a large map on the session doc.
- Admin session monitoring uses on-demand reads instead of a global live listener.
- Expired sessions are marked first, then recursively deleted after a retention window.

### Operational guidance

- Prefer the emulator for testing game mechanics, rules, and UI before touching production.
- Keep completed sessions short-lived in production if you do not need historical archives.
- Avoid leaving instructor dashboards open for unused sessions during live classes.
- Run one production project per course or term if you want cleaner retention and billing boundaries.
- Review Firestore indexes after deploying any new compound query.

### Main cost drivers to watch

- instructor roster refreshes on large sessions
- results-page reads of every `playerState` in completed games
- round-history growth in `playerStates` for long sessions with many players
- scheduled cleanup lag if expired sessions are not deleted promptly

## Security Model

- Students authenticate anonymously before join/reconnect.
- Session membership is stored under `members/{authUid}` and enforced in Firestore rules.
- Players can read only their own live player state during the game.
- Instructors/admins can read instructor-only state and full session data.
- All authoritative writes go through Cloud Functions.

## Deployment Notes

1. Deploy Firestore rules first.
2. Deploy functions.
3. Deploy the web app.
4. Validate one full end-to-end game in the emulator or a staging Firebase project before classroom use.

## Classroom Readiness Checklist

- Verify `ADMIN_EMAIL` and instructor approval flow.
- Confirm email notifications are optional or configured.
- Run one 3-5 player emulator smoke test.
- Run one high-load dry run with many browser tabs or scripted joins.
- Confirm scheduled cleanup is enabled in the target Firebase project.
