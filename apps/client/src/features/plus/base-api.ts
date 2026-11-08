import api from "@/lib/api-client";

export type BaseProperty = {
  id: string;
  name: string;
  type: "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "formula";
  position: string;
  typeOptions?: { options?: Array<{ id: string; name: string; color?: string }> } | null;
};

export type BaseView = { id: string; name: string; type: "table" | "kanban" | "list"; config: any };
export type BaseRow = { id: string; cells: Record<string, any>; position: string };
export type BasePageRef = { id: string; title: string; slugId: string; spaceId: string };

export async function getBase(pageId: string): Promise<{ page: any; properties: BaseProperty[]; views: BaseView[] }> {
  const res: any = await api.get(`/plus/base/${pageId}`);
  return res?.data ?? res;
}

export async function addProperty(pageId: string, dto: { name: string; type: string; typeOptions?: unknown }) {
  const res: any = await api.post(`/plus/base/${pageId}/properties`, dto);
  return res?.data ?? res;
}

export async function removeProperty(pageId: string, propertyId: string) {
  const res: any = await api.delete(`/plus/base/${pageId}/properties/${propertyId}`);
  return res?.data ?? res;
}

export async function listRows(pageId: string, params?: { sort?: string; dir?: "asc" | "desc"; type?: string }) {
  const q = new URLSearchParams();
  if (params?.sort) q.set("sort", params.sort);
  if (params?.dir) q.set("dir", params.dir);
  if (params?.type) q.set("type", params.type);
  const res: any = await api.get(`/plus/base/${pageId}/rows?${q.toString()}`);
  return (res?.data ?? res) as { items: BaseRow[]; nextCursor: string | null };
}

export async function addRow(pageId: string, cells: Record<string, unknown>) {
  const res: any = await api.post(`/plus/base/${pageId}/rows`, { cells });
  return res?.data ?? res;
}

export async function patchRow(pageId: string, rowId: string, cells: Record<string, unknown>) {
  const res: any = await api.patch(`/plus/base/${pageId}/rows/${rowId}`, { cells });
  return res?.data ?? res;
}

export async function deleteRow(pageId: string, rowId: string) {
  const res: any = await api.delete(`/plus/base/${pageId}/rows/${rowId}`);
  return res?.data ?? res;
}

export async function addView(pageId: string, dto: { name: string; type: string; config?: unknown }) {
  const res: any = await api.post(`/plus/base/${pageId}/views`, dto);
  return res?.data ?? res;
}

export async function listBases(): Promise<BasePageRef[]> {
  const res: any = await api.get("/plus/bases");
  return res?.data ?? res;
}

export async function setBase(pageId: string, isBase: boolean) {
  const res: any = await api.post(`/plus/bases/${pageId}`, { isBase });
  return res?.data ?? res;
}
