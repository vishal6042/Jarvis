import os from "node:os";
import si from "systeminformation";

export interface Health {
  cpu: number;
  memory: number;
  disk: number;
  /** Null when there is no discrete GPU, or the driver will not say. */
  gpu: number | null;
  gpuName: string | null;
  gpuMemory: number | null;
  /** Seconds the Control Center has been open, not the machine's uptime. */
  uptime: number;
  environment: string;
}

const startedAt = Date.now();

/**
 * GPU load is read on its own slower clock: on NVIDIA, systeminformation shells out to nvidia-smi,
 * which is far heavier than reading CPU and memory and not worth doing every few seconds.
 */
let gpuCache: { at: number; gpu: number | null; name: string | null; memory: number | null } = {
  at: 0,
  gpu: null,
  name: null,
  memory: null,
};
const GPU_TTL_MS = 8000;

async function readGpu(): Promise<typeof gpuCache> {
  if (Date.now() - gpuCache.at < GPU_TTL_MS) return gpuCache;
  try {
    const { controllers } = await si.graphics();
    // The discrete card, not the integrated one: pick whichever reports the most memory, and
    // prefer a controller that actually reports a load figure.
    const usable = controllers.filter((c) => c.vram || c.utilizationGpu != null);
    const card =
      usable.find((c) => c.utilizationGpu != null && (c.vram ?? 0) > 1000) ??
      usable.sort((a, b) => (b.vram ?? 0) - (a.vram ?? 0))[0];

    const used = card?.memoryUsed ?? null;
    const total = card?.memoryTotal ?? card?.vram ?? null;
    gpuCache = {
      at: Date.now(),
      gpu: card?.utilizationGpu != null ? Math.round(card.utilizationGpu) : null,
      name: card?.model ?? null,
      memory: used != null && total ? Math.round((used / total) * 100) : null,
    };
  } catch {
    gpuCache = { at: Date.now(), gpu: null, name: null, memory: null };
  }
  return gpuCache;
}

/**
 * The numbers behind the rings.
 *
 * Disk is the drive the checkout lives on rather than the system drive, because that is the one
 * that fills with build output and logs. Every reading is best-effort: a metric that cannot be
 * taken reports zero, or null for the GPU, rather than failing the whole panel.
 */
export async function readHealth(repoRoot: string): Promise<Health> {
  const [cpu, mem, disks, gpu] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.fsSize().catch(() => []),
    readGpu(),
  ]);

  const drive = repoRoot.slice(0, 2).toUpperCase();
  const target = disks.find((d) => d.mount?.toUpperCase().startsWith(drive)) ?? disks[0] ?? null;

  return {
    cpu: Math.round(cpu?.currentLoad ?? 0),
    // "used" counts what the OS reports as unavailable, not the cache it can hand back.
    memory: mem ? Math.round(((mem.total - mem.available) / mem.total) * 100) : 0,
    disk: target ? Math.round(target.use ?? 0) : 0,
    gpu: gpu.gpu,
    gpuName: gpu.name,
    gpuMemory: gpu.memory,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    environment: os.hostname() ? `Local (${os.hostname()})` : "Local",
  };
}
