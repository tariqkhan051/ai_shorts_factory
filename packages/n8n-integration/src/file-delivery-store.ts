import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  EventDeliveryRecord,
  EventDeliveryStore,
  OrchestrationRecord,
  OrchestrationStore,
} from './delivery-types.js';
import {
  MemoryEventDeliveryStore,
  MemoryOrchestrationStore,
} from './memory-delivery-store.js';

type DeliveryPersisted = {
  version: 1;
  deliveries: EventDeliveryRecord[];
};

type OrchestrationPersisted = {
  version: 1;
  orchestrations: OrchestrationRecord[];
};

async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(tmp, filePath);
}

/**
 * Durable outbound event delivery audit. Never holds project/scene authority.
 */
export class FileEventDeliveryStore implements EventDeliveryStore {
  private readonly inner = new MemoryEventDeliveryStore();
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options?: { filePath?: string }) {
    this.filePath =
      options?.filePath ??
      process.env.ASF_N8N_DELIVERY_PATH?.trim() ??
      join(process.cwd(), '.data', 'n8n-deliveries.json');
    this.hydrateSync();
  }

  private hydrateSync(): void {
    try {
      if (!existsSync(this.filePath)) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        return;
      }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as DeliveryPersisted;
      if (parsed.version === 1) {
        this.inner.importAll(parsed.deliveries ?? []);
      }
    } catch {
      // start empty
    }
  }

  private async withPersist<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      const result = await fn();
      await atomicWriteJson(this.filePath, {
        version: 1,
        deliveries: this.inner.exportAll(),
      } satisfies DeliveryPersisted);
      return result;
    });
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getByIdempotencyKey(idempotencyKey: string): Promise<EventDeliveryRecord | null> {
    return this.inner.getByIdempotencyKey(idempotencyKey);
  }

  getByEventId(eventId: string): Promise<EventDeliveryRecord | null> {
    return this.inner.getByEventId(eventId);
  }

  upsert(record: EventDeliveryRecord): Promise<EventDeliveryRecord> {
    return this.withPersist(() => this.inner.upsert(record));
  }

  listRecent(limit?: number): Promise<EventDeliveryRecord[]> {
    return this.inner.listRecent(limit);
  }

  listFailed(limit?: number): Promise<EventDeliveryRecord[]> {
    return this.inner.listFailed(limit);
  }

  listRetryable(nowIso: string, limit?: number): Promise<EventDeliveryRecord[]> {
    return this.inner.listRetryable(nowIso, limit);
  }
}

/**
 * Durable orchestration UI/control metadata (execution ids, pause flags).
 * Application project/video/scene records remain authoritative.
 */
export class FileOrchestrationStore implements OrchestrationStore {
  private readonly inner = new MemoryOrchestrationStore();
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options?: { filePath?: string }) {
    this.filePath =
      options?.filePath ??
      process.env.ASF_N8N_ORCHESTRATION_PATH?.trim() ??
      join(process.cwd(), '.data', 'n8n-orchestration.json');
    this.hydrateSync();
  }

  private hydrateSync(): void {
    try {
      if (!existsSync(this.filePath)) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        return;
      }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as OrchestrationPersisted;
      if (parsed.version === 1) {
        this.inner.importAll(parsed.orchestrations ?? []);
      }
    } catch {
      // start empty
    }
  }

  private async withPersist<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      const result = await fn();
      await atomicWriteJson(this.filePath, {
        version: 1,
        orchestrations: this.inner.exportAll(),
      } satisfies OrchestrationPersisted);
      return result;
    });
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  get(projectId: string, videoId: string): Promise<OrchestrationRecord | null> {
    return this.inner.get(projectId, videoId);
  }

  listByProject(projectId: string): Promise<OrchestrationRecord[]> {
    return this.inner.listByProject(projectId);
  }

  upsert(record: OrchestrationRecord): Promise<OrchestrationRecord> {
    return this.withPersist(() => this.inner.upsert(record));
  }
}
