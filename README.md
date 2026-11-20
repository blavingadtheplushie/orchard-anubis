# orchard-anubis

An [Orchard](https://github.com/hackclub/orchard) graft that puts an [Anubis](https://github.com/TecharoHQ/anubis) proof-of-work challenge in front of apps, toggled per app from the Orchard dashboard.

> Status: **0.1.0, early.** Running on one instance (orchard.notri1.fr).

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

## The graft (`graft/`)

- A **Challenge** tab on every app (`deployment.tabs`): on/off and excluded paths (APIs, webhooks).
- API under `/apiv1/anubis/deployments/:id` (`GET` needs project view, `PUT` needs project edit), with `anubis.enabled` / `anubis.disabled` audit entries.
- Its own table `ext_anubis.protected_apps`. Domains come from Orchard's `ingresses` table (read-only `coreReads`).
- A reconciler (leader only, every minute and right after each change) server-side-applies one overlay `IngressRoute` per protected domain, and deletes overlays that are no longer wanted. It only ever deletes routes labelled `orchard-anubis/managed=true`.
- Domains using Orchard's own protection (`password` / `orchard`) or redirects are skipped and shown as "not covered".

## Install

1. Cluster side: `kubectl apply -f deploy/cluster/` (Anubis, middlewares, policy, RBAC for `orchard-server`), and set `allowCrossNamespace: true` on Traefik's CRD provider.
2. Trust the publisher key in your Orchard values:

   ```yaml
   graftSettings:
     keys: ["Yx6ZRujFLIMUCEYYNFqNWsf8ZpwZWDmSx24Rt4D8VdM="]
   grafts:
     - id: anubis
       version: 0.1.0
       source: https://github.com/blavingadtheplushie/orchard-anubis/releases/download/v0.1.0/anubis-0.1.0.graft
       digest: sha256:<see release notes>
   ```

3. `helm upgrade` Orchard. The tab shows up on every app.

## Build

```sh
cd graft && npm install && npx graft doctor && npx graft pack --key <key.pem>
```

## License

AGPL-3.0, same as Orchard.
