# WinterFur Manage — GitOps & Deployment Guide

This directory contains base Kubernetes manifests and Kustomize overlays for **WinterFur Manage**.

## Architecture & Repository Separation

* **Public App Repository (`wtf-manage`):** Contains the application source code, Dockerfile, build pipeline, and generic manifest templates. No secrets or production credentials belong here.
* **Private GitOps Repository (`github.com/diniskawolfiii/wtf-manage-gitops`):** Tracked by **ArgoCD**. Contains the real environment manifests, sealed secrets, and cluster configurations.

---

## 1. Branching Model & Container Images (CI)

The CI workflow in `.github/workflows/ci.yml` is configured for **Option A (develop -> main)**:

* **Develop Branch (`develop`):** Every push to `develop` automatically builds and pushes the image:
  * `ghcr.io/diniskawolfiii/wtf-manage:test`
  * Targeted by the `test` overlay (`manage-test.winterfur.org`).
* **Main Branch (`main`):** Merging a PR into `main` automatically builds and pushes:
  * `ghcr.io/diniskawolfiii/wtf-manage:latest`
  * Targeted by the `prod` overlay (`manage.winterfur.org`).
* **Git Releases (`v*` tags):** Tagging a release (`git tag v0.0.1`) publishes semver-tagged images (e.g. `:v0.0.1`).
* **Pull Requests:** PRs to `main` or `develop` trigger automatic linting and test builds (`npm run build`) to ensure code quality without publishing images.

---

## 2. Moving Manifests to your Private GitOps Repo

Copy the `deploy/` templates into your private repository:

```
wtf-manage-gitops/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── kustomization.yaml
└── environments/
    ├── test/
    │   ├── kustomization.yaml
    │   └── secret.sealed.yaml   <-- Encrypted with Bitnami Sealed Secrets
    └── prod/
        ├── kustomization.yaml
        └── secret.sealed.yaml
```

---

## 3. Required Secrets (`wtf-manage-secret`)

The application expects the following environment variables in `wtf-manage-secret`:

| Key | Description |
|---|---|
| `KEYCLOAK_CLIENT_SECRET` | OIDC Client Secret configured in Keycloak realm |
| `AUTH_SECRET` | Random 32+ character string for session encryption |

### Creating a Sealed Secret (Example):

```bash
kubectl create secret generic wtf-manage-secret \
  --namespace winterfur-test \
  --from-literal=KEYCLOAK_CLIENT_SECRET="your-keycloak-secret" \
  --from-literal=AUTH_SECRET="your-generated-session-key" \
  --dry-run=client -o yaml | \
  kubeseal --controller-name=sealed-secrets --format=yaml > secret.sealed.yaml
```

---

## 4. ArgoCD Application Manifest (Example)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: wtf-manage-test
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'git@github.com:diniskawolfiii/wtf-manage-gitops.git'
    targetRevision: main
    path: environments/test
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: winterfur-test
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

