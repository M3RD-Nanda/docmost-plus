import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTable } from "@tabler/icons-react";
import api from "@/lib/api-client";
import { listBases, setBase, type BasePageRef } from "@/features/plus/base-api";

export default function BaseListPage() {
  const navigate = useNavigate();
  const [bases, setBases] = useState<BasePageRef[]>([]);
  const [opened, setOpened] = useState(false);
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({ title: "", spaceId: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setBases(await listBases());
      const res: any = await api.post("/spaces", {});
      const items = (res?.data ?? res)?.items ?? [];
      setSpaces(items.map((s: any) => ({ id: s.id, name: s.name })));
      if (items[0] && !form.spaceId) setForm((f) => ({ ...f, spaceId: items[0].id }));
    } catch {
      /* diamkan: halaman tetap bisa dipakai untuk membuat basis */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res: any = await api.post("/pages/create", { title: form.title, spaceId: form.spaceId });
      const page = res?.data ?? res;
      await setBase(page.id, true);
      setOpened(false);
      navigate(`/base/${page.id}`);
    } catch (e: any) {
      notifications.show({ message: e?.response?.data?.message ?? "Gagal membuat basis", color: "red" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container size={900} py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Basis</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
            Buat basis
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          Basis adalah tabel/kanban di dalam wiki — daftar temuan audit, rekap borang, tracker tindakan.
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {bases.map((b) => (
            <Card key={b.id} withBorder padding="md" onClick={() => navigate(`/base/${b.id}`)} style={{ cursor: "pointer" }}>
              <Group gap="sm">
                <IconTable size={18} />
                <Text fw={500}>{b.title || "(tanpa judul)"}</Text>
              </Group>
            </Card>
          ))}
          {!bases.length && (
            <Text size="sm" c="dimmed">
              Belum ada basis. Buat yang pertama.
            </Text>
          )}
        </SimpleGrid>
      </Stack>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Buat basis baru">
        <Stack>
          <TextInput
            label="Judul"
            placeholder="mis. Daftar Temuan Audit 2026"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
          />
          <Select
            label="Space"
            data={spaces.map((s) => ({ value: s.id, label: s.name }))}
            value={form.spaceId}
            onChange={(v) => setForm({ ...form, spaceId: v ?? "" })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Batal
            </Button>
            <Button loading={busy} disabled={!form.title.trim() || !form.spaceId} onClick={create}>
              Buat
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
