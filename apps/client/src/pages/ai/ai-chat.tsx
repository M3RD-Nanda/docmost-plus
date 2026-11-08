import { useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { askWiki, type AiAnswer } from "@/features/plus/ai-api";
import { Link } from "react-router-dom";

type Turn = { role: "user" | "assistant"; text: string; citations?: AiAnswer["citations"] };

export default function AiChatPage() {
  const [question, setQuestion] = useState("");
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    try {
      const res = await askWiki({ chatId, message: q });
      setChatId(res.chatId);
      setTurns((t) => [...t, { role: "assistant", text: res.answer, citations: res.citations }]);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? "Gagal memanggil AI",
        color: "red",
      });
      setTurns((t) => t.slice(0, -1));
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container size={760} py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Tanya Wiki</Title>
          <Badge variant="light">jawaban disitir dari halaman</Badge>
        </Group>

        <Alert color="gray" variant="light">
          Jawaban hanya memakai halaman yang boleh Anda akses. Bila tidak ada sumbernya, AI akan
          menjawab "Belum ada di wiki" — bukan mengarang.
        </Alert>

        <Stack gap="sm">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <Card key={i} withBorder padding="sm" bg="var(--mantine-color-default-hover)">
                <Text size="sm" fw={500}>
                  {t.text}
                </Text>
              </Card>
            ) : (
              <Card key={i} withBorder padding="sm">
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {t.text}
                </Text>
                {!!t.citations?.length && (
                  <Group gap="xs" mt="xs">
                    <Text size="xs" c="dimmed">
                      Sumber:
                    </Text>
                    {t.citations.map((c) => (
                      <Anchor key={c.pageId} size="xs" component={Link} to={`/s/${c.spaceId}/p/${c.slugId}`}>
                        {c.title}
                      </Anchor>
                    ))}
                  </Group>
                )}
              </Card>
            ),
          )}
        </Stack>

        <Textarea
          placeholder="Tanya apa saja tentang isi wiki…"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          minRows={2}
          autosize
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Group justify="flex-end">
          <Button loading={busy} onClick={submit} disabled={!question.trim()}>
            Tanya
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
