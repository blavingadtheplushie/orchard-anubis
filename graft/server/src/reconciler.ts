import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Doors, type ApplyDoor, type DbDoor, type KubeDoor } from '@orchardlabs/graft-sdk/server';
import { deleteManaged, listManaged } from './kube';
import { overlay, routeName } from './routes';
import { desiredTargets } from './store';

const INTERVAL_MS = 60_000;

@Injectable()
export class Reconciler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('anubis');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(Doors.db) private readonly db: DbDoor,
    @Inject(Doors.kube) private readonly kube: KubeDoor,
    @Inject(Doors.apply) private readonly apply: ApplyDoor
  ) {}

  onModuleInit(): void {
    this.kube.onLeaderAcquired(() => void this.run().catch(() => undefined));
    this.timer = setInterval(() => {
      if (this.kube.isLeader()) void this.run().catch(() => undefined);
    }, INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Makes the cluster match the table. Safe to call from any replica. */
  run(): Promise<void> {
    if (!this.running) {
      this.running = this.reconcile().finally(() => (this.running = null));
    }
    return this.running;
  }

  private async reconcile(): Promise<void> {
    const kc = this.kube.kc;
    if (!kc) return;
    try {
      const targets = await desiredTargets(this.db);
      const wanted = new Set<string>();
      for (const t of targets) {
        wanted.add(routeName(t.ingressId));
        await this.apply.serverSideApply(overlay(t));
      }
      for (const name of await listManaged(kc)) {
        if (!wanted.has(name)) await deleteManaged(kc, name);
      }
    } catch (err) {
      this.logger.warn(`reconcile failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
