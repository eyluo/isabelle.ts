# isabelle.ts

The mediamigos Discord bot (now in TypeScript!).

| Command | What it does |
|---|---|
| `/ping` | Replies "Pong!" |
| `/hello` | Placeholder, replies "hello!" |
| `/mia` | Checks MangaDex for new Made in Abyss chapters; posts the link + opens a discussion thread for mainline chapters, sends an FYI for extra chapters, and remembers progress (also runs proactively once a day) |
| *(auto)* | Anyone who says "Ozen" without her full title gets corrected |

## Setup

Requires Node.js 22.12+.

```bash
npm install
```

Create `.env.json` in the project root (it is git-ignored):

```json
{
    "auth": {
        "discord": { "token": "…", "clientID": "…", "guildID": "…" }
    },
    "data": {
        "madeInAbyss": { "channelID": "…", "latestChapter": 75 }
    }
}
```

Optional fields under `data.madeInAbyss`:
- `pollIntervalHours` — how often to proactively check MangaDex (defaults to `24`; set to `0` to disable)
- `mangaID` — MangaDex manga UUID (defaults to Made in Abyss)

In the [Discord Developer Portal](https://discord.com/developers/applications), enable
**Bot → Privileged Gateway Intents → Message Content Intent** (needed for the Ozen reply).

## Scripts

| Script | Purpose |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run the bot (build first) |
| `npm run dev` | Build + run |
| `npm run deploy` | Register slash commands with your guild |
| `npm test` | Build + run all tests |
| `npm run test:watch` | Re-run tests on change |
| `npm run test:coverage` | Tests + coverage report (`coverage/index.html`) |

## Adding a command

Drop a file in `src/commands/` — it's discovered automatically:

```ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll a die');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(`🎲 ${Math.floor(Math.random() * 6) + 1}`);
}
```

Then `npm run deploy` to register it. Events work the same way in `src/events/`
(export `name`, optional `once`, and `execute`).

## Testing

- **Unit** (`test/unit/`): commands and events called directly with small fake
  discord.js objects (see `test/helpers.ts`). No network, no login.
- **Integration** (`test/integration/`): the loaders against the built `dist/`,
  slash command JSON validity, `.env.json` read/write on a temp file, and the
  MangaDex client against a stubbed `fetch`.

When adding a command, add a test next to the others in `test/unit/`; the
loader test will also fail until its expected command list is updated.

### Manual end-to-end checklist

Discord has no official sandbox or mocking framework, and bots can't invoke
other bots' slash commands, so true end-to-end runs are manual. Before
deploying, in a private test server:

1. `npm run deploy` → "Successfully registered N application commands."
2. `npm run dev` → "isabelle.ts is ready to roll! Logged in as …"
3. `/ping` → "Pong!"  ·  `/hello` → "hello!"
4. Say "ozen" → corrected; say "Ozen the Immovable Sovereign" → no reply
5. `/mia` → "Chapter N is not available yet..." (or, if out, link + new thread
   in the configured channel, and `latestChapter` bumped in `.env.json`)
