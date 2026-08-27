# Trackr

Trackr is a Vite and React application that turns read-only Gmail messages into a job-search pipeline. Relevant messages are classified into Applied, Interview requested, and Denied columns. Users can preview messages, visually filter the board, choose a lookback range, and correct classifications without changing anything in Gmail.

Gmail messages are fetched directly from Google and processed in the user's browser. Trackr has no application server or database.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system boundaries, data flow, source layout, scanning, and session lifecycle
- [Function reference](docs/FUNCTION_REFERENCE.md) — every named function, component, hook, and helper
- [Configuration and types](docs/CONFIGURATION_AND_TYPES.md) — constants, data contracts, environment, Blueprint, and public assets
- [Email classification](docs/CLASSIFICATION.md) — candidate search, rule priority, conditional-language protections, and extensions
- [Google OAuth](docs/GOOGLE_OAUTH.md) — cloud setup, test users, origins, verification, and common errors
- [Render deployment](docs/RENDER_DEPLOYMENT.md) — Blueprint deployment, custom domains, headers, and release checks
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md) — data inventory, retention, MIME handling, network boundaries, and logout
- [Contributing](docs/CONTRIBUTING.md) — development workflow and mandatory function-documentation policy

The public-facing [Privacy Policy](public/privacy.html) and [Terms of Service](public/terms.html) are deployed with the application.

## Features

- Google Identity Services browser authorization
- Read-only Gmail access through `gmail.readonly`
- Maximum scan of 1,500 candidate messages
- One, three, six, twelve, and twenty-four-month presets; all-time and custom ranges
- Rule-based job-email classification with conditional-language protection
- Scrollable status columns and read-only email previews
- Manual status corrections for the current tab session
- Interview-request links that open the original Gmail thread
- Instant client-side sender, subject, and content filtering
- Fifteen-minute automatic refresh while the token remains valid
- Refresh-safe, tab-scoped sessions with a 24-hour maximum lifetime
- Light and dark themes without a first-paint flash
- Render security headers, legal pages, logo, favicon, and touch icon

## Requirements

- Node.js `>=22.12.0 <25`
- npm
- A Google Cloud project with Gmail API enabled
- A Web application OAuth client

## Local setup

1. In Google Cloud, enable the Gmail API.
2. Configure Google Auth Platform with an External audience or an appropriate Workspace Internal audience.
3. Add `https://www.googleapis.com/auth/gmail.readonly` under Data Access.
4. Create a Web application OAuth client.
5. Add `http://localhost:5173` as an Authorized JavaScript origin.
6. Copy `.env.example` to `.env.local` and enter the client ID.
7. If the app is in Testing, add each Google account under Audience → Test users.
8. Install and start the app:

```bash
npm ci
npm run dev
```

The OAuth client ID is a public browser identifier. Never add a client secret, access token, refresh token, `credentials.json`, or `token.json` to the project.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google Web application OAuth client ID embedded at build time |

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production bundle in `dist/` |
| `npm run lint` | Run ESLint across the project |
| `npm run preview` | Serve the production bundle locally |

## Privacy summary

The Google token, Gmail address, email previews, and manual classifications stay in memory and the current tab's `sessionStorage`. They survive page refresh, but are cleared when the tab closes, the user disconnects, or the 24-hour session expires. Only the theme preference uses persistent `localStorage`.

## Deploying

The repository-root `render.yaml` defines the Render Static Site. Push the repository, create a Render Blueprint, provide `VITE_GOOGLE_CLIENT_ID`, and deploy. After Render assigns an HTTPS URL, add the exact origin to the Google OAuth client. See [Render deployment](docs/RENDER_DEPLOYMENT.md) and [Google OAuth](docs/GOOGLE_OAUTH.md) for the complete checklist.

Because `gmail.readonly` is a restricted scope, a public app should complete Google's OAuth brand and restricted-scope verification. Testing mode is appropriate for explicitly listed friends and development accounts.
