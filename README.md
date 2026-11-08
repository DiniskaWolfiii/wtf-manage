# WinterFur Manage (WTF Manage)

**WinterFur Manage** is the convention and identity self-service management portal for WinterFur staff and attendees.

* **Frontend & Backend:** Next.js (App Router), Mantine UI v7, TypeScript
* **Identity Backbone:** Keycloak (`identity.winterfur.org`) via OpenID Connect
* **Infrastructure:** Docker (multi-stage standalone build), Kubernetes, ArgoCD GitOps

---

## Features

* **Attendee & Staff Profile:** Manage real name, nickname, contact info, home address with country selector, pronouns, languages, and profile picture synced with Keycloak.
* **Account Security:** Password change, TOTP 2FA configuration status, hardware WebAuthn passkeys.
* **Crew Dashboard:** Volunteer Agreement (NDA) status and viewer modal, quick links to internal tooling, department roles, and FR-managed skills.
* **Portal Administration:** Portal branding, SMTP, and dynamic quick links manager.

---

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Copy environment variables:**
   ```bash
   cp .env.example .env.local
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Build & Docker

### Standalone Production Build
```bash
npm run build
npm run start
```

### Build Docker Container
```bash
docker build -t ghcr.io/diniskawolfiii/wtf-manage:latest .
```

---

## Deployment & GitOps

This repository contains the **open-source application code**.

All actual environment configurations, domains, and secrets are maintained in the private GitOps repository:
👉 `github.com/diniskawolfiii/wtf-manage-gitops`

* Manifest templates and Kustomize overlays are available in [`deploy/`](./deploy/).
* Read the [Deployment & GitOps Guide](./deploy/README.md) for details on setting up ArgoCD, Sealed Secrets, and staging environments.
