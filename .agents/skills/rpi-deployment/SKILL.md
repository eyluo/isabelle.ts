---
name: rpi-deployment
description: >-
  Guide for deploying the isabelle.ts Discord bot to a Raspberry Pi for 24/7
  hosting. Use when the user asks about deployment, hosting, running the bot
  on a Pi, systemd setup, or production configuration.
---

# Raspberry Pi Deployment Guide for isabelle.ts

## Project Quick Reference

- **Runtime**: Node.js 20+ (CommonJS output, ES2022; uses built-in `fetch`)
- **Discord lib**: discord.js v14 (only runtime dependency)
- **Config file**: `.env.json` (contains Discord token, Reddit app creds, and mutable state)
- **Build**: `npm run build` (TypeScript 7, outputs to `dist/`)
- **Run**: `npm start` (runs `node dist/index.js`)
- **Deploy commands**: `npm run deploy` (registers slash commands with Discord API)
- **External APIs**: Discord, Reddit (app-only OAuth via `src/util/reddit.ts`; no account password needed)
- **Discord portal**: the **Message Content** privileged intent must be enabled
  (Bot → Privileged Gateway Intents) or the bot fails to log in with "Used disallowed intents"

## Prerequisites (on the Pi)

1. Raspberry Pi 3B+ or newer, Raspberry Pi OS 64-bit
2. Node.js 20 LTS via NodeSource:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs build-essential python3
   ```
3. Git: `sudo apt install -y git`

## Deployment Steps

1. Clone the repo: `git clone <repo-url> ~/isabelle.ts && cd ~/isabelle.ts`
2. Install deps: `npm install`
3. Create `.env.json` with fresh credentials (never reuse leaked tokens)
4. Build: `npm run build`
5. Register commands: `npm run deploy`
6. Test: `npm start` — verify "isabelle.ts is ready to roll!" appears

## systemd Service

Create `/etc/systemd/system/isabelle.service`:

```ini
[Unit]
Description=Isabelle Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/isabelle.ts
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable isabelle.service
sudo systemctl start isabelle.service
```

## Monitoring & Maintenance

- **Logs**: `journalctl -u isabelle.service -f`
- **Restart**: `sudo systemctl restart isabelle.service`
- **Update**: `git pull && npm install && npm run build && sudo systemctl restart isabelle.service`
- **Stateful data**: `.env.json` stores `latestChapter` — back up periodically

## Security Notes

- `.env.json` has plaintext secrets — keep it out of version control
- Regenerate all tokens/credentials before deploying to a new environment
