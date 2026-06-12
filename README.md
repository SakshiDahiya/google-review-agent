# Google Review AI Assistant

A wizard-driven CLI that automates Google Business review replies using OpenAI and Playwright browser automation.

Run everything with a single command:

```bash
review-bot
```

## Features

- Playwright browser automation (no Google Cloud / OAuth / API keys required)
- Persistent browser session (login once, reuse session)
- Review scraping from Google Business reviews page
- AI reply generation (OpenAI)
- Manual approval workflow (optional)
- Dry run mode
- Review state tracking in JSON
- Automatic reply posting via browser

## Prerequisites

- Node.js 18+
- [OpenAI API key](https://platform.openai.com/api-keys)
- A Google account with access to your Business Profile reviews

## Installation

```bash
npm install
npm run build
npm link   # makes `review-bot` available globally
```

Playwright Chromium is installed automatically via `postinstall`.

## Usage

### First run

When no configuration exists, `review-bot` walks you through:

1. OpenAI API key, business name, tone, description, custom instructions
2. Browser opens — sign in to Google manually
3. Navigate to your reviews page and confirm
4. Optional immediate automation run

### Subsequent runs

Shows a startup menu:

1. **Run Review Automation** — scrape, generate, approve, post
2. **Change Settings** — update API key, tone, dry run, etc.
3. **Change Business** — update business name (re-capture reviews URL)
4. **Login to Google (Browser)** — re-authenticate in browser
5. **Exit**

## Settings (`config/settings.json`)

```json
{
  "businessName": "ABC Dental Clinic",
  "businessDescription": "Family dental practice in downtown",
  "replyTone": "Professional",
  "customInstructions": "",
  "manualApproval": true,
  "autoPost": false,
  "dryRun": true,
  "openAiApiKey": "sk-...",
  "reviewsPageUrl": "https://business.google.com/..."
}
```

## Data Storage

All data is stored in the project directory:

```
config/
  settings.json
  business-discovery-last.json
data/
  reviews.json
  generated-replies.json
logs/
  app.log
.browser-profile/     # persistent Playwright session
```

These paths are gitignored (except you manage `config/settings.json` locally).

### Review state (`data/reviews.json`)

```json
{
  "fetchedAt": "2026-06-11T12:00:00.000Z",
  "reviews": [
    {
      "reviewId": "abc123",
      "author": "John Doe",
      "rating": 5,
      "reviewText": "Great service!",
      "reviewDate": "2 weeks ago",
      "ownerReply": "",
      "generatedReply": "Thank you for your kind words!",
      "approved": true,
      "posted": false,
      "processedAt": "2026-06-11T12:05:00.000Z"
    }
  ]
}
```

## Architecture

```
src/
  automation/    # Playwright browser automation
  clients/       # OpenAI client
  repositories/  # JSON file persistence
  services/      # Business logic
  models/        # Zod schemas and types
  utils/         # Paths, logging, file helpers
  container.ts   # Dependency injection
  index.ts       # CLI entry point
```

## Migration from Google API version

If upgrading from the previous Google OAuth/API-based version:

1. **Delete obsolete files** from `config/`:
   - `oauth.json`
   - `business.json`
   - `credentials.json`

2. **Re-run setup** or manually update `settings.json` with new fields:
   - `businessName` (replaces `business.json`)
   - `openAiApiKey` (renamed from `openaiApiKey`)
   - `dryRun`, `autoPost`, `reviewsPageUrl`

3. **Install Playwright**: `npm install && npx playwright install chromium`

4. **First browser run**: sign in manually and capture your reviews page URL.

5. **Review data format changed** — old `reviews.json` will be replaced on next scrape. Back up if needed.

### Files removed in this refactor

| Deleted | Replaced by |
|---------|-------------|
| `src/clients/google-oauth.client.ts` | `src/automation/browser-manager.ts` |
| `src/clients/google-business.client.ts` | `src/automation/review-scraper.ts` |
| `src/services/oauth.service.ts` | `src/services/session.service.ts` |
| `src/services/business.service.ts` | `settings.businessName` + session URL capture |
| `src/repositories/oauth.repository.ts` | `.browser-profile/` persistent context |
| `src/repositories/business.repository.ts` | `settings.json` fields |
| `src/models/oauth.ts` | — |
| `src/models/business.ts` | — |
| `config/credentials.json.example` | — |

## Development

```bash
npm run dev      # Run with tsx
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

## License

MIT
