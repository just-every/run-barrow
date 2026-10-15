# Self-hosted type

Barlow 400, 500 and 600, Barlow Condensed 700 and DM Mono 400 are served locally. No page requests third-party fonts. Each family includes its SIL Open Font License from the Google Fonts repository.

The shared `rer-theme.css` declares the body, heading and mono families once. The app and run site use those tokens. `src/base/font-head.ts` preloads Barlow regular for the app and native auth/setup documents.
