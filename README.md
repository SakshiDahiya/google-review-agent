# Google Review AI Assistant

**AI writes and posts replies to your Google Business reviews — one at a time, in your voice.**

You run a simple command. It finds reviews you haven't answered, drafts a reply with OpenAI, posts it to Google, and shows you each one as it goes. First-time setup walks you through Google sign-in, picking your business, and tuning how replies should sound.

**You need:** a Mac or Windows computer, internet, a Google account that manages your business, and an [OpenAI API key](https://platform.openai.com/api-keys) (a few cents per reply).

---

## Get your OpenAI API key

1. Sign up at [platform.openai.com](https://platform.openai.com/signup)
2. Add a card under [Billing](https://platform.openai.com/settings/organization/billing)
3. Create a key at [API Keys](https://platform.openai.com/api-keys) → **Create new secret key**
4. Copy the `sk-...` key immediately — you won't see it again. Keep it private.

---

## Install (one time)

Install [Node.js LTS](https://nodejs.org) if you don't have it. Open **Terminal** (Mac) or **Command Prompt** (Windows), go to this folder, and run:

```bash
cd /path/to/google-review-agent
npm install
npm run build
npm link
```

(`npm link` lets you type `review-bot` from anywhere. If it fails on Mac, try `sudo npm link`.)

---

## First run

```bash
review-bot
```

1. Choose **Run Review Automation**
2. Paste your OpenAI API key when asked
3. Sign in to Google in the browser window (use the account that manages your business)
4. Pick your business from the list
5. **Tune Reply Style** — read sample replies, tell it what to change in plain English (*"warmer"*, *"shorter"*, *"more emojis"*), press Enter when happy
6. It fetches your reviews (first time may take a few minutes), then replies to each unreplied review

---

## Every week after that

```bash
review-bot
```

Choose **Run Review Automation** → wait → **Exit** when done.

**Change Settings** if you need to switch Google account, change business, or tweak reply style.

---

## Useful options

Edit `config/settings.json`:

| Setting | Effect |
|---------|--------|
| `"dryRun": true` | Preview replies only — nothing posted |
| `"dryRun": false` | Post for real (default) |
| `"manualApproval": true` | Approve each reply before posting |
| `"manualApproval": false` | Auto-post (default after setup) |

---

## If something goes wrong

- **Wrong Google account** → Change Settings → Switch Google Account  
- **Wrong business** → Change Settings → Change Business  
- **Replies sound off** → Change Settings → Tune Reply Style  
- **`review-bot` not found** → run `npm start` from the project folder instead  
- **Refresh all reviews** → delete `data/reviews.json` and run again  

---

## Commands cheat sheet

```bash
cd /path/to/google-review-agent   # go to project folder
review-bot                        # start the tool
npm start                         # alternative if review-bot isn't linked
```

MIT License.
