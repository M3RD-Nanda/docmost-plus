import api from "@/lib/api-client";

export type SsoProviderRow = {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
};

export async function listSsoProviders(): Promise<SsoProviderRow[]> {
  const res: any = await api.get("/plus/sso/admin/providers");
  return res?.data ?? res;
}

export async function addSsoProvider(dto: {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowSignup?: boolean;
}) {
  const res: any = await api.post("/plus/sso/admin/providers", dto);
  return res?.data ?? res;
}

export async function setSsoProviderEnabled(id: string, isEnabled: boolean) {
  const res: any = await api.patch(`/plus/sso/admin/providers/${id}`, { isEnabled });
  return res?.data ?? res;
}

export async function deleteSsoProvider(id: string) {
  const res: any = await api.delete(`/plus/sso/admin/providers/${id}`);
  return res?.data ?? res;
}
