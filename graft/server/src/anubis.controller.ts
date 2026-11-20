import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put
} from '@nestjs/common';
import {
  Auth,
  Doors,
  GraftUserId,
  RequireScope,
  type AuditDoor,
  type AuthDoor,
  type DbDoor
} from '@orchardlabs/graft-sdk/server';
import { Reconciler } from './reconciler';
import { normalizePaths } from './routes';
import { domainsFor, ineligible } from './store';

type State = {
  enabled: boolean;
  excludedPaths: string[];
  canEdit: boolean;
  domains: { host: string; path: string; protected: boolean; reason: string | null }[];
};

@Controller('deployments')
export class AnubisController {
  constructor(
    @Inject(Doors.db) private readonly db: DbDoor,
    @Inject(Doors.auth) private readonly auth: AuthDoor,
    @Inject(Doors.audit) private readonly audit: AuditDoor,
    @Inject(Reconciler) private readonly reconciler: Reconciler
  ) {}

  private async project(deploymentId: string): Promise<{ projectId: string; label: string }> {
    const { rows } = await this.db.query<{ projectId: string; label: string }>(
      `SELECT project_id AS "projectId", COALESCE(display_name, name) AS label
         FROM public.deployments WHERE id = $1`,
      [deploymentId]
    );
    if (!rows[0]) throw new NotFoundException('App not found');
    return rows[0];
  }

  private async state(deploymentId: string, canEdit: boolean): Promise<State> {
    const [{ rows }, domains] = await Promise.all([
      this.db.query<{ excludedPaths: string[] }>(
        'SELECT excluded_paths AS "excludedPaths" FROM protected_apps WHERE deployment_id = $1',
        [deploymentId]
      ),
      domainsFor(this.db, deploymentId)
    ]);
    const enabled = rows.length > 0;
    return {
      enabled,
      excludedPaths: rows[0]?.excludedPaths ?? [],
      canEdit,
      domains: domains.map((d) => {
        const reason = ineligible(d);
        return { host: d.host, path: d.path, protected: enabled && !reason, reason };
      })
    };
  }

  @Get(':id')
  @Auth()
  @RequireScope('read')
  async get(
    @GraftUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<State> {
    const { projectId } = await this.project(id);
    const access = await this.auth.requireProjectView(projectId, userId);
    return this.state(id, access.canEdit);
  }

  @Put(':id')
  @Auth()
  @RequireScope('deploy')
  async set(
    @GraftUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { enabled?: unknown; excludedPaths?: unknown }
  ): Promise<State> {
    const { projectId, label } = await this.project(id);
    const access = await this.auth.requireProjectEdit(projectId, userId);
    if (typeof body?.enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean');
    let paths: string[];
    try {
      paths = normalizePaths(body.excludedPaths ?? []);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (body.enabled) {
      await this.db.query(
        `INSERT INTO protected_apps (deployment_id, excluded_paths, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (deployment_id) DO UPDATE
           SET excluded_paths = EXCLUDED.excluded_paths, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, paths, userId]
      );
    } else {
      await this.db.query('DELETE FROM protected_apps WHERE deployment_id = $1', [id]);
    }
    await this.audit.log({
      action: body.enabled ? 'anubis.enabled' : 'anubis.disabled',
      actorUserId: userId,
      organizationId: access.organizationId,
      projectId,
      deploymentId: id,
      targetType: 'deployment',
      targetId: id,
      targetLabel: label,
      metadata: { excludedPaths: paths }
    });
    await this.reconciler.run().catch(() => {
      throw new BadRequestException('Saved, but the cluster could not be updated yet. It retries every minute.');
    });
    return this.state(id, access.canEdit);
  }
}
