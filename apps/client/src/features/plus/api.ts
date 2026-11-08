import api from "@/lib/api-client";

export type MfaSetupResult = {
  manualKey: string;
  otpauthUrl: string;
  qrCodeDataUrl: string | null;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

export async function verifyMfa(dto: { mfaToken: string; code: string }) {
  const res = await api.post("/plus/mfa/verify", dto);
  return res.data;
}

export async function getMfaStatus(): Promise<{ enabled: boolean }> {
  const res = await api.get("/plus/mfa/status");
  return res.data;
}

export async function startMfaSetup(): Promise<MfaSetupResult> {
  const res = await api.post("/plus/mfa/setup", {});
  return res.data;
}

export async function enableMfa(code: string): Promise<{ backupCodes: string[] }> {
  const res = await api.post("/plus/mfa/enable", { code });
  return res.data;
}

export async function disableMfa(code: string) {
  const res = await api.post("/plus/mfa/disable", { code });
  return res.data;
}

export async function regenerateBackupCodes(code: string) {
  const res = await api.post("/plus/mfa/backup-codes", { code });
  return res.data as { backupCodes: string[] };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const res = await api.get("/plus/api-keys");
  return res.data;
}

export async function createApiKey(dto: { name: string; expiresInDays?: number }) {
  const res = await api.post("/plus/api-keys", dto);
  return res.data as ApiKeyRow & { token: string };
}

export async function revokeApiKey(id: string) {
  const res = await api.delete(`/plus/api-keys/${id}`);
  return res.data;
}
