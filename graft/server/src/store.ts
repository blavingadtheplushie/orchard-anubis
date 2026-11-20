import type { DbDoor } from '@orchardlabs/graft-sdk/server';
import { validHost, type Target } from './routes';

export type DomainRow = {
  ingressId: string;
  deploymentId: string;
  host: string;
  path: string;
  namespace: string;
  protectionMode: string;
  redirectTarget: string | null;
  service: string | null;
  port: number | null;
};

const DOMAINS_SQL = `
  SELECT i.id AS "ingressId", i.deployment_id AS "deploymentId", i.host, i.path, i.namespace,
         i.protection_mode::text AS "protectionMode", i.redirect_target AS "redirectTarget",
         s.name AS service, COALESCE(i.service_port, s.port) AS port
    FROM public.ingresses i
    LEFT JOIN public.services s ON s.id = i.service_id
`;

/** Why a domain can't get an overlay, or null if it can. */
export function ineligible(d: DomainRow): string | null {
  if (d.protectionMode !== 'none')
    return `uses Orchard's ${d.protectionMode} protection, turn it off first`;
  if (d.redirectTarget) return 'is a redirect';
  if (!d.service || !d.port) return 'has no service';
  if (!validHost(d.host)) return 'has an unsupported hostname';
  return null;
}

export async function domainsFor(db: DbDoor, deploymentId: string): Promise<DomainRow[]> {
  const { rows } = await db.query<DomainRow>(
    `${DOMAINS_SQL} WHERE i.deployment_id = $1 ORDER BY i.host, i.path`,
    [deploymentId]
  );
  return rows;
}

/** Every overlay that should exist right now. */
export async function desiredTargets(db: DbDoor): Promise<Target[]> {
  const { rows } = await db.query<DomainRow & { excludedPaths: string[] }>(
    `SELECT p.excluded_paths AS "excludedPaths", i.id AS "ingressId", i.deployment_id AS "deploymentId",
            i.host, i.path, i.namespace, i.protection_mode::text AS "protectionMode",
            i.redirect_target AS "redirectTarget", s.name AS service, COALESCE(i.service_port, s.port) AS port
       FROM protected_apps p
       JOIN public.ingresses i ON i.deployment_id = p.deployment_id
       LEFT JOIN public.services s ON s.id = i.service_id`
  );
  return rows
    .filter((r) => !ineligible(r))
    .map((r) => ({
      ingressId: r.ingressId,
      deploymentId: r.deploymentId,
      host: r.host,
      path: r.path || '/',
      namespace: r.namespace,
      service: r.service!,
      port: r.port!,
      excludedPaths: r.excludedPaths ?? []
    }));
}
