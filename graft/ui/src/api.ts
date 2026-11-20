import type { HostApi } from '@orchardlabs/graft-sdk/client';

export type Domain = { host: string; path: string; protected: boolean; reason: string | null };
export type State = { enabled: boolean; excludedPaths: string[]; canEdit: boolean; domains: Domain[] };

export const getState = (host: HostApi, id: string) => host.api<State>(`/deployments/${id}`);
export const setState = (host: HostApi, id: string, input: { enabled: boolean; excludedPaths: string[] }) =>
  host.api<State>(`/deployments/${id}`, { method: 'PUT', json: input });
