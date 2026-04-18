# 🏠 Real Estate Stager Agent

> **Beta Hacks 2026** — Send a room photo via iMessage, get back an AI-staged video.

An AI-powered real estate staging agent that transforms empty room photos into beautifully staged video walkthroughs using ByteDance Seedance 2.0.

## How It Works

1. 📱 User sends a room photo via iMessage
2. 🤖 Agent receives it via Photon Spectrum SDK
3. 🎨 Seedance 2.0 generates a staged video from the image
4. 🎬 Agent sends the video back via iMessage

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Messaging:** [Photon Spectrum](https://docs.photon.codes) (`spectrum-ts`) for iMessage
- **AI Video:** ByteDance Seedance 2.0 via Volcengine Ark API
- **Storage:** [Butterbase](https://docs.butterbase.ai) file storage
- **Database:** Butterbase PostgreSQL

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your API keys in .env

# Run in development mode
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PHOTON_PROJECT_ID` | Photon Spectrum project ID |
| `PHOTON_PROJECT_SECRET` | Photon Spectrum project secret |
| `BUTTERBASE_APP_ID` | Butterbase app ID |
| `BUTTERBASE_API_URL` | Butterbase API URL |
| `BUTTERBASE_API_KEY` | Butterbase service key |
| `ARK_API_KEY` | Volcengine Ark API key for Seedance |
| `SEEDANCE_MODEL` | (Optional) Model ID, defaults to `doubao-seedance-2-0-260128` |

## Database Setup

Create the `staging_jobs` table in your Butterbase PostgreSQL:

```sql
CREATE TABLE staging_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       TEXT NOT NULL,
  image_object_id TEXT,
  video_object_id TEXT,
  seedance_task_id TEXT,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'succeeded', 'failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

## Project Structure

```
├── main.ts                  # Entry point: Spectrum message loop
├── lib/
│   ├── butterbase.ts        # Storage + DB helper
│   ├── seedance-client.ts   # Volcengine Ark API wrapper
│   └── prompt-engineer.ts   # Staging prompt builder
├── types/
│   └── index.ts             # TypeScript interfaces
├── .env.example             # Environment variable template
├── package.json
└── tsconfig.json
```

## License

MIT
