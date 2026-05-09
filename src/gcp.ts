import { execAsync } from "./spawn.js";

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

/**
 * Read GCP env. Returns null when GCP_PROJECT is unset — callers decide whether
 * that's a hard error (cloud subcommands) or a silent skip (status overview).
 */
export function readGcpEnv(): GcpEnv | null {
  const project = process.env.GCP_PROJECT;
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
