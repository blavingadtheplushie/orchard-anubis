import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { KubeConfigLike } from '@orchardlabs/graft-sdk/server';
import { LABEL, NAMESPACE } from './routes';

type Kc = KubeConfigLike & {
  applyToHTTPSOptions(opts: Record<string, unknown>): Promise<void>;
};

const BASE = `/apis/traefik.io/v1alpha1/namespaces/${NAMESPACE}/ingressroutes`;

async function call<T>(kc: KubeConfigLike, method: string, path: string): Promise<{ status: number; body: T }> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error('no kubernetes cluster configured');
  const url = new URL(path, cluster.server);
  const opts: Record<string, unknown> = { method, headers: { accept: 'application/json' } };
  await (kc as Kc).applyToHTTPSOptions(opts);
  const send = url.protocol === 'http:' ? httpRequest : request;
  return new Promise((resolve, reject) => {
    const req = send(url, opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let body: unknown = data;
        try { body = JSON.parse(data); } catch { /* keep text */ }
        resolve({ status: res.statusCode ?? 0, body: body as T });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('kubernetes request timed out')));
    req.end();
  });
}

export async function listManaged(kc: KubeConfigLike): Promise<string[]> {
  const res = await call<{ items?: { metadata: { name: string } }[] }>(
    kc, 'GET', `${BASE}?labelSelector=${encodeURIComponent(`${LABEL}=true`)}`
  );
  if (res.status !== 200) throw new Error(`listing ingressroutes failed (${res.status})`);
  return (res.body.items ?? []).map((i) => i.metadata.name);
}

/** Deletes a route, but only if it carries our label. */
export async function deleteManaged(kc: KubeConfigLike, name: string): Promise<void> {
  if (!/^anubis-[a-f0-9]{16}$/.test(name)) return;
  const got = await call<{ metadata?: { labels?: Record<string, string> } }>(kc, 'GET', `${BASE}/${name}`);
  if (got.status === 404) return;
  if (got.body.metadata?.labels?.[LABEL] !== 'true') return;
  const res = await call(kc, 'DELETE', `${BASE}/${name}`);
  if (res.status >= 300 && res.status !== 404) throw new Error(`deleting ${name} failed (${res.status})`);
}
