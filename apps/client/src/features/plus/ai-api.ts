import api from "@/lib/api-client";

export type AiCitation = { pageId: string; title: string; slugId: string; spaceId: string };
export type AiAnswer = { chatId: string; answer: string; citations: AiCitation[] };

export async function askWiki(dto: { chatId?: string; message: string }): Promise<AiAnswer> {
  const res: any = await api.post("/plus/ai/chat", dto);
  return res?.data ?? res;
}

export async function listAiChats() {
  const res: any = await api.get("/plus/ai/chats");
  return res?.data ?? res;
}

export async function getAiMessages(chatId: string) {
  const res: any = await api.get(`/plus/ai/chats/${chatId}/messages`);
  return res?.data ?? res;
}
