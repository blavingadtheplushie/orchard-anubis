# orchard-anubis

An [Orchard](https://github.com/hackclub/orchard) graft that puts an [Anubis](https://github.com/TecharoHQ/anubis) proof-of-work challenge in front of apps, toggled per app from the Orchard dashboard.

> Status: **early work in progress.** The cluster side works and is tested by hand; the graft (UI + API) is being written.

## How it works

Orchard does not let apps carry `traefik.*` annotations (the `orchard-tenant-ingresses` admission policy rejects them), and its reconciler rewrites app ingresses every few minutes. So this graft never touches Orchard's ingresses. Instead it adds an **overlay**:

- one shared Anubis instance in `kube-system` (`deploy/cluster/`), running in forwardAuth mode (`TARGET=" "`);
- for each protected app, a Traefik `IngressRoute` with the same host and a higher priority, which routes to the app's own Service through two middlewares:
  - `anubis-challenge` (`errors` middleware): turns Anubis' 401 into the challenge page,
  - `anubis-auth` (`forwardAuth` to `/.within.website/x/cmd/anubis/api/check`);
- `/.within.website/` on that host goes to Anubis itself (challenge assets and `pass-challenge`);
- excluded paths (APIs, webhooks) get a route without the middlewares.

Disabling protection deletes the overlay; Orchard's own ingress takes over again.

### Requirements

- Traefik with `providers.kubernetesCRD.allowCrossNamespace: true` (the overlay lives in `kube-system` and points to the app's namespace).
- The policy must use non-2xx status codes (`CHALLENGE: 401`, `DENY: 403`): with forwardAuth, any 2xx means "allowed".
- Correct client IPs reaching Traefik (`forwardedHeaders.trustedIPs`, `externalTrafficPolicy: Local`), since Anubis reads `X-Forwarded-For`.

### Caveats

- Anubis protection and Orchard's own protection (`password` / `orchard`) on the same domain are mutually exclusive: the overlay would bypass Orchard's protection proxy. The graft refuses this combination.

## Planned graft

- `deployment.tabs` slot: a **Challenge** tab per app (on/off, difficulty, excluded paths).
- NestJS module with its own `ext_anubis` schema; `requireProjectEdit` on writes; audit log entries.
- `kube.apply` door to server-side-apply the overlays; reconcile on rollout events.
- Instance settings: redirect domains, default policy.

## License

AGPL-3.0, same as Orchard.
