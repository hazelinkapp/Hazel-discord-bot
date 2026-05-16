# ⚡ Hazelink Bot — Hazel

> A modular, feature-rich Discord bot built with **Discord.js v14**.
> Bot display name: **Hazel** | Project name: `hazelink-bot`

---

## 📁 Project Structure

```
hazelink-bot/
├── index.js                        # Main entry point
├── dashboard.js                    # Express dashboard
├── package.json
├── config/
│   └── config.json                 # Prefix, IDs (NO token here)
├── commands/
│   ├── core/
│   │   ├── ping.js
│   │   └── help.js
│   ├── moderation/
│   │   ├── ban.js
│   │   ├── kick.js
│   │   └── timeout.js
│   ├── support/
│   │   └── ticket.js
│   ├── utility/
│   │   ├── userinfo.js
│   │   ├── serverinfo.js
│   │   └── avatar.js
│   └── community/
│       ├── rank.js
│       ├── leaderboard.js
│       └── suggest.js
├── events/
│   ├── guildMemberAdd.js
│   ├── guildMemberRemove.js
│   └── messageCreate.js
├── features/
│   ├── ticketSystem/index.js
│   ├── faqSystem/index.js
│   ├── levelingSystem/index.js
│   └── suggestionSystem/index.js
├── utils/
│   ├── embeds.js
│   ├── logger.js
│   └── permissions.js
└── database/
    └── userProfiles.js
```

---

## 🚀 Quick Start (Local)

### 1. Prerequisites
- **Node.js v18+** — [nodejs.org](https://nodejs.org)
- A **Discord Bot Token** — [discord.com/developers](https://discord.com/developers/applications)
- *(Optional)* A **MongoDB URI** — [mongodb.com/atlas](https://www.mongodb.com/atlas)

### 2. Install dependencies
```bash
cd hazelink-bot
npm install
```

### 3. Set environment variables

Create a `.env` file **or** set them in your shell:
```env
DISCORD_TOKEN=your_bot_token_here
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/hazelink
```

> ⚠️ **Never** put your token in `config.json` or commit it to git.

### 4. Configure `config/config.json`

Fill in your IDs:
```json
{
  "prefix": "!",
  "ownerID": "YOUR_DISCORD_USER_ID",
  "supportServerID": "YOUR_SERVER_ID",
  "welcomeChannelID": "CHANNEL_ID",
  "leaveChannelID": "CHANNEL_ID",
  "ticketCategoryID": "CATEGORY_ID",
  "modRoleID": "ROLE_ID",
  "adminRoleID": "ROLE_ID"
}
```

### 5. Run the bot
```bash
npm start
```

You should see:
```
[INFO ] Hazel is online! Logged in as Hazel#1234
[OK   ] Registered 10 slash command(s).
```

---

## ☁️ SkyBots Deployment

SkyBots hosts Node.js bots with zero-config deployments.

### Step 1 — Upload your project

1. Compress the `hazelink-bot/` folder into a `.zip` file  
   *(exclude `node_modules/` — SkyBots installs them automatically)*
2. Log in to your [SkyBots Dashboard](https://skybots.net)
3. Click **"New Bot"** → **"Upload Project"**
4. Upload the `.zip` file

### Step 2 — Set Environment Variables

In your SkyBots bot settings, navigate to **"Environment Variables"** and add:

| Key             | Value                                      |
|-----------------|--------------------------------------------|
| `DISCORD_TOKEN` | `your_actual_discord_bot_token`            |
| `MONGO_URI`     | `mongodb+srv://user:pass@cluster.net/db`   |
| `DEBUG`         | `false` *(set to `true` for verbose logs)* |
| `PORT`          | `3000` *(for the Express dashboard)*       |

> 🔒 SkyBots encrypts all environment variables at rest.

### Step 3 — Configure Start Command

In **"Bot Settings"** → **"Start Command"**, set:
```
npm start
```

SkyBots will automatically run `npm install` before starting.

### Step 4 — Deploy

Click **"Deploy"** or push to your connected GitHub repo. SkyBots will:
1. Pull your code
2. Run `npm install`
3. Execute `node index.js`
4. Keep it alive with auto-restart on crash

### Step 5 — Verify

Check the **Logs** tab in your SkyBots dashboard. You should see:
```
✅ Hazel is online! Logged in as Hazel#XXXX
[API] Registered N slash command(s).
[DB]  Connected to MongoDB.
```

---

## 🔧 Optional: Enable the Dashboard

The Express dashboard runs on the same process. To activate it, add this to the bottom of `index.js`:

```js
const { startDashboard } = require('./dashboard');
client.once('ready', () => startDashboard(client));
```

Then visit `http://localhost:3000` (or your SkyBots app URL) to see:
- `/` — Overview & bot status
- `/tickets` — Ticket history
- `/stats` — XP leaderboard
- `/logs` — Live console output
- `/api/stats` — JSON stats endpoint
- `/api/users` — JSON user data

---

## ⚙️ Feature Systems

### Leveling System
Automatically awards XP per message (1-minute cooldown).
To enable, add to `index.js`:
```js
const { initLeveling } = require('./features/levelingSystem');
initLeveling(client);
```

### Ticket System (Panel)
Send a persistent button panel to a channel:
```js
const { sendTicketPanel, initTicketSystem } = require('./features/ticketSystem');
initTicketSystem(client);
// After client is ready:
const channel = client.channels.cache.get('YOUR_CHANNEL_ID');
sendTicketPanel(channel, client);
```

### FAQ System
```js
const { initFAQ } = require('./features/faqSystem');
initFAQ(client);
```
Edit the `FAQ_ENTRIES` array in `features/faqSystem/index.js` to add your own Q&As.

### Suggestion System
```js
const { initSuggestions } = require('./features/suggestionSystem');
initSuggestions(client);
```

---

## 🛡️ Permissions

All permission checks live in `utils/permissions.js`:

| Helper              | Description                             |
|---------------------|-----------------------------------------|
| `isAdmin(member)`   | Has Administrator perm or admin role    |
| `isMod(member)`     | Has mod role, admin role, or mod perm   |
| `isOwner(userId)`   | Matches `ownerID` in config             |
| `hasPermission(m, flag)` | Any Discord permission flag        |
| `botHasPermission(channel, flag)` | Check bot's own perms     |
| `requirePermission(interaction, fn)` | Auto-reply on failure  |

---

## 📦 Dependencies

| Package      | Version  | Purpose                        |
|--------------|----------|--------------------------------|
| discord.js   | ^14.15.3 | Discord API client             |
| mongoose     | ^8.4.1   | MongoDB ODM                    |
| express      | ^4.19.2  | Web dashboard                  |
| dotenv       | ^16.4.5  | Load `.env` file locally       |

---

## 🤝 Contributing

1. Fork this repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "feat: add my feature"`
4. Push and open a PR

---

## 📝 License

MIT © Hazelink
