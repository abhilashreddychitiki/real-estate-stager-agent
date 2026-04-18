# Real Estate Stager Agent (Beta Hacks 2026)

An AI-driven iMessage agent that transforms photos of empty rooms into professionally staged video walkthroughs using **ByteDance Seedance 2.0**.

---

## 🚀 How it Works
1. 🏠 **User** sends a photo of an empty room via iMessage.
2. 🤖 **Agent** acknowledges the message and starts the background pipeline.
3. 🎨 **Seedance 2.0** generates a high-quality staged video walkthrough.
4. 🎬 **Agent** sends the final video back to the user via iMessage.

---

## 🛠 Tech Stack
- **Runtime:** Node.js 20+ (TypeScript)
- **Messaging:** [Photon Spectrum](https://docs.photon.codes) (`spectrum-ts`)
- **AI Video:** ByteDance Seedance 2.0 via Volcengine Ark API
- **Storage/DB:** [Butterbase](https://docs.butterbase.ai) (PostgreSQL + File Storage)

---

## ⚙️ Setup Instructions

### 1. Butterbase Setup
Create your app in the [Butterbase Dashboard](https://dashboard.butterbase.ai) and apply the following schema (using the CLI or REST API):

```json
{
  "tables": {
    "staging_jobs": {
      "columns": {
        "id":               { "type": "uuid", "primaryKey": true, "default": "gen_random_uuid()" },
        "sender_id":        { "type": "text", "nullable": false },
        "image_object_id":  { "type": "text" },
        "video_object_id":  { "type": "text" },
        "seedance_task_id": { "type": "text" },
        "status":           { "type": "text", "nullable": false, "default": "'processing'" },
        "error_message":    { "type": "text" },
        "created_at":       { "type": "timestamptz", "default": "now()" },
        "updated_at":       { "type": "timestamptz", "default": "now()" }
      }
    }
  },
  "name": "create staging_jobs table"
}
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
- `PHOTON_PROJECT_ID` / `PHOTON_PROJECT_SECRET` (from Spectrum Dashboard)
- `BUTTERBASE_APP_ID` / `BUTTERBASE_API_KEY`
- `ARK_API_KEY` (from Volcengine Ark)

### 3. Installation & Run
```bash
npm install
npm run dev
```

---

## 🛠 Troubleshooting

### `ENOTFOUND spectrum-cloud.photon.codes`
If you see this error, your network or firewall is likely blocking the Spectrum SDK from reaching Photon's cloud.
- **Check DNS:** Run `nslookup spectrum-cloud.photon.codes`.
- **Firewall:** Ensure your network allows outgoing connections to `*.photon.codes` on port 443.
- **VPN:** Try disconnecting or using a different network if you are on a restricted corporate VPN.
