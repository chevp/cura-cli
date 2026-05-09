import { commandExists, execAsync } from "./spawn.js";

export interface GcpEnv {
  project: string;
  region: string;
}

export const CLOUD_RUN_SERVICES = ["cura-app", "core-service", "cura-llm"] as const;
export type CloudRunService = (typeof CLOUD_RUN_SERVICES)[number];

export interface ServiceInfo {
  exists: boolean;
  url: string;
  ingress: string;
  iap: string;
  revision: string;
  ready: boolean;
  notReadyReason: string;
}

const EMPTY: ServiceInfo = {
  exists: false,
  url: "",
  ingress: "",
  iap: "",
  revision: "",
  ready: false,
  notReadyReason: "",
};

let cachedGcloudProject: string | null | undefined;

async function readGcloudProject(): Promise<string | null> {
  if (cachedGcloudProject !== undefined) return cachedGcloudProject;
  if (!commandExists("gcloud")) {
    cachedGcloudProject = null;
    return null;
  }
  const r = await execAsync(
    "gcloud",
    ["config", "get-value", "project", "--quiet"],
    { separateStderr: true, timeoutMs: 5_000 },
  );
  // gcloud prints "(unset)" when no project is configured — reject that.
  const out = (r.stdout ?? "").trim();
  if (!r.ok || !out || out === "(unset)") {
    cachedGcloudProject = null;
    return null;
  }
  cachedGcloudProject = out;
  return out;
}

/**
 * Synchronous read of GCP_PROJECT env var. Returns null when unset. Use
 * resolveGcpEnv() for the async fallback to `gcloud config get-value project`.
 */
export function readGcpEnv(): GcpEnv | null {
  const project = process.env.GCP_PROJECT;
  if (!project) return null;
  return {
    project,
    region: process.env.GCP_REGION || "europe-west6",
  };
}

/**
 * Resolves GCP_PROJECT from (1) the env var, (2) `gcloud config get-value project`.
 * Region falls back to GCP_REGION env, then "europe-west6". Returns null when
 * neither source yields a project.
 *
 * GCP_PROJECT is a GitHub Actions secret in cura's deploy workflow, so it is
 * NOT in the local shell unless the user exports it. The gcloud-config
 * fallback makes 'cura cloud' work after `gcloud config set project <id>`.
 */
export async function resolveGcpEnv(): Promise<GcpEnv | null> {
  const fromEnv = readGcpEnv();
  if (fromEnv) return fromEnv;
  const project = await readGcloudProject();
  if (!project) return null;
  return {
    project,
    region: process.env.GCP_REGION || "europe-west6",
  };
}

export async function describeService(svc: string, env: GcpEnv): Promise<ServiceInfo> {
  const r = await execAsync(
    "gcloud",
    [
      "run",
      "services",
      "describe",
      svc,
      `--region=${env.region}`,
      `--project=${env.project}`,
      "--format=json",
    ],
    { separateStderr: true, timeoutMs: 10_000 },
  );
  if (!r.ok || !r.stdout.trim()) return { ...EMPTY };
  try {
    const obj = JSON.parse(r.stdout) as {
      status?: {
        url?: string;
        latestReadyRevisionName?: string;
        conditions?: Array<{ type?: string; status?: string; message?: string }>;
      };
      spec?: { template?: { metadata?: { annotations?: Record<string, string> } } };
      metadata?: { annotations?: Record<string, string> };
    };
    const tplAnn = obj.spec?.template?.metadata?.annotations ?? {};
    const meta = obj.metadata?.annotations ?? {};
    const readyCond = obj.status?.conditions?.find((c) => c.type === "Ready");
    return {
      exists: true,
      url: obj.status?.url ?? "",
      ingress: tplAnn["run.googleapis.com/ingress"] ?? "all",
      iap: meta["run.googleapis.com/iap-enabled"] ?? "false",
      revision: obj.status?.latestReadyRevisionName ?? "?",
      ready: readyCond?.status === "True",
      notReadyReason:
        readyCond?.status === "False" ? readyCond?.message ?? "not ready" : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function activeGcloudAccount(): Promise<string> {
  const r = await execAsync(
    "gcloud",
    ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
    { separateStderr: true, timeoutMs: 5_000 },
  );
  return r.ok ? r.stdout.trim() : "";
}
