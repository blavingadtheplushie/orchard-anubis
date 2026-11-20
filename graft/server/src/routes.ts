import { createHash } from 'node:crypto';

export const NAMESPACE = 'kube-system';
export const LABEL = 'orchard-anubis/managed';
export const ANUBIS_SERVICE = { name: 'anubis', namespace: NAMESPACE, port: 8923 };
export const MIDDLEWARES = [
  { name: 'anubis-challenge', namespace: NAMESPACE },
  { name: 'anubis-auth', namespace: NAMESPACE }
];
const BASE_PRIORITY = 100000;

export type Target = {
  ingressId: string;
  deploymentId: string;
  host: string;
  path: string;
  namespace: string;
  service: string;
  port: number;
  excludedPaths: string[];
};

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const PATH = /^\/[A-Za-z0-9._~\-\/]*$/;

export const validHost = (h: string) => HOST.test(h) && h.length <= 253;
export const validPath = (p: string) => PATH.test(p) && p.length <= 200 && !p.includes('//');

export function normalizePaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    let p = raw.trim();
    if (!p) continue;
    if (!p.startsWith('/')) p = `/${p}`;
    if (!validPath(p)) throw new Error(`invalid path: ${raw}`);
    out.add(p);
  }
  if (out.size > 20) throw new Error('at most 20 excluded paths');
  return [...out].sort();
}

export const routeName = (ingressId: string) =>
  `anubis-${createHash('sha256').update(ingressId).digest('hex').slice(0, 16)}`;

function rule(host: string, path: string): string {
  const h = `Host(\`${host}\`)`;
  return path === '/' || path === '' ? h : `${h} && PathPrefix(\`${path}\`)`;
}

/** The overlay IngressRoute for one Orchard ingress. */
export function overlay(t: Target) {
  const service = { name: t.service, namespace: t.namespace, port: t.port };
  const routes: Record<string, unknown>[] = [
    {
      match: rule(t.host, '/.within.website/'),
      kind: 'Rule',
      priority: BASE_PRIORITY + 1000,
      services: [ANUBIS_SERVICE]
    }
  ];
  for (const p of t.excludedPaths) {
    if (t.path !== '/' && !p.startsWith(t.path)) continue;
    routes.push({
      match: rule(t.host, p),
      kind: 'Rule',
      priority: BASE_PRIORITY + 500 + p.length,
      services: [service]
    });
  }
  routes.push({
    match: rule(t.host, t.path),
    kind: 'Rule',
    priority: BASE_PRIORITY + t.path.length,
    middlewares: MIDDLEWARES,
    services: [service]
  });
  return {
    apiVersion: 'traefik.io/v1alpha1',
    kind: 'IngressRoute',
    metadata: {
      name: routeName(t.ingressId),
      namespace: NAMESPACE,
      labels: { [LABEL]: 'true', 'app.kubernetes.io/managed-by': 'orchard-anubis' },
      annotations: {
        'orchard-anubis/ingress-id': t.ingressId,
        'orchard-anubis/deployment-id': t.deploymentId,
        'orchard-anubis/host': t.host
      }
    },
    spec: { entryPoints: ['web', 'websecure'], routes }
  };
}
