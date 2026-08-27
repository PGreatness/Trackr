# Trackr

Trackr is a Vite + React app that uses read-only Gmail access to organize job-search mail into Applied, Interview requested, and Denied columns. Gmail messages are fetched directly from Google and processed in the user's browser; Trackr has no application server or database.

## Local development

1. Enable the Gmail API in a Google Cloud project.
2. Configure the OAuth consent screen and add `https://www.googleapis.com/auth/gmail.readonly`.
3. Create a Web application OAuth client.
4. Add `http://localhost:5173` under Authorized JavaScript origins.
5. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.
6. If the consent screen is in Testing mode, add each account under Test users.
7. Run `npm ci` and `npm run dev`.

The OAuth client ID is a public browser identifier. Never add a Google client secret, access token, refresh token, or downloaded credentials file to this project.

## Privacy and session behavior

The Google access token, email previews, account address, and manual classifications are stored only in the current tab's `sessionStorage`. They survive a page refresh but are cleared when the tab closes, the user disconnects, or the 24-hour session expires. Only the light/dark theme preference uses persistent browser storage. Gmail data is never sent to Render or an application backend.

## Render deployment

The repository-root `render.yaml` defines a Render Static Site with the correct root directory, build command, publish directory, environment variable, caching, and security headers.

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. In Render, choose **New > Blueprint** and connect the repository.
3. Keep the default Blueprint path `render.yaml`.
4. When prompted, set `VITE_GOOGLE_CLIENT_ID` to the Web application OAuth client ID.
5. Deploy the Blueprint.
6. Add the resulting `https://YOUR-SERVICE.onrender.com` URL to the OAuth client's Authorized JavaScript origins.

For a public production launch, use a custom domain and add that HTTPS origin to Google Cloud. Configure the OAuth consent screen with the deployed home page, `/privacy.html`, `/terms.html`, the developer support email, and the verified domain. Because `gmail.readonly` is a restricted scope, complete Google's OAuth verification before opening the app beyond approved test users.
