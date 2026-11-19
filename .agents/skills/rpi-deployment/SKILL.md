---
name: rpi-deployment
description: >-
  Guide for deploying the isabelle.ts Discord bot to a Raspberry Pi for 24/7
  hosting. Use when the user asks about deployment, hosting, running the bot
  on a Pi, systemd setup, or production configuration.
---

# Raspberry Pi Deployment Guide for isabelle.ts

## Project Quick Reference

- **Runtime**: Node.js 22.12+ (24 LTS recommended; CommonJS output, ES2022; uses built-in `fetch`)
- **Discord lib**: discord.js v14 (only runtime dependency; no native modules to compile)
- **Config file**: `.env.json` (contains Discord token, Reddit app creds, and mutable state)
- **Build**: `npm run build` (TypeScript 7, outputs to `dist/`)
- **Test**: `npm test` (Vitest; unit + integration, no network; see README for the manual e2e checklist)
- **Run**: `npm start` (runs `node dist/index.js`)
- **Deploy commands**: `npm run deploy` (registers slash commands with Discord API)
- **External APIs**: Discord, Reddit (app-only OAuth via `src/util/reddit.ts`; no account password needed)
- **Discord portal**: the **Message Content** privileged intent must be enabled
  (Bot → Privileged Gateway Intents) or the bot fails to log in with "Used disallowed intents"

## Prerequisites (on the Pi)

1. Raspberry Pi 3B+ or newer, Raspberry Pi OS 64-bit
2. Node.js 24 LTS via NodeSource (Node 20 is end-of-life; Vitest needs 22.12+):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
3. Git: `sudo apt install -y git`

## Deployment Steps

1. Clone the repo: `git clone <repo-url> ~/isabelle.ts && cd ~/isabelle.ts`
2. Install deps: `npm ci` (dev deps are needed to build; use `npm ci` for repeatable installs)
3. Create `.env.json` with fresh credentials (never reuse leaked tokens)
4. Verify: `npm test` — all tests should pass (this also builds `dist/`)
5. Register commands: `npm run deploy`
6. Test: `npm start` — verify "isabelle.ts is ready to roll!" appears

## systemd Service

Create `/etc/systemd/system/isabelle.service`:

```ini
[Unit]
Description=Isabelle Discord Bot
After=network-online.target
Wants=network-online.target
ConditionPathExists=/home/pi/isabelle.ts/.env.json

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

Enable and start (once `.env.json` exists):
```bash
sudo systemctl daemon-reload
sudo systemctl enable isabelle.service
sudo systemctl start isabelle.service
```

## Auto-Updates (systemd Timer)

The repo includes a host-agnostic updater at `scripts/update.sh` (supports `--force` to rebuild/redeploy even when `HEAD` matches upstream). Configure host-specific behavior via environment variables:

- `ISABELLE_REMOTE` (default: `origin`)
- `ISABELLE_BRANCH` (default: `master`)
- `ISABELLE_RESTART_CMD` (optional; skipped if unset)
- `ISABELLE_BACKUP_DIR` (optional; backs up `.env.json` before updates, keeping the newest 10)

Create `/etc/systemd/system/isabelle-update.service`:

```ini
[Unit]
Description=Update Isabelle Discord Bot from Git
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=pi
WorkingDirectory=/home/pi/isabelle.ts
Environment="ISABELLE_RESTART_CMD=sudo -n systemctl try-restart isabelle.service"
Environment="ISABELLE_BACKUP_DIR=/home/pi/.local/share/isabelle-backups"
ExecStart=/home/pi/isabelle.ts/scripts/update.sh
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/isabelle-update.timer` (daily at 3:00 AM local time):

```ini
[Unit]
Description=Daily update check for Isabelle Discord Bot

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
```

Enable the timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now isabelle-update.timer
```

## Monitoring & Maintenance

- **Logs**: `journalctl -u isabelle.service -f`
- **Update logs**: `journalctl -u isabelle-update.service -n 50 --no-pager`
- **Restart**: `sudo systemctl restart isabelle.service`
- **Manual update**: `sudo systemctl start isabelle-update.service` (or `ISABELLE_RESTART_CMD="sudo -n systemctl try-restart isabelle.service" ~/isabelle.ts/scripts/update.sh`)
- **Stateful data**: `.env.json` stores `latestChapter` — back up periodically (the updater also saves copies in `ISABELLE_BACKUP_DIR`)

## Security Notes

- `.env.json` has plaintext secrets — keep it out of version control
- Regenerate all tokens/credentials before deploying to a new environment
