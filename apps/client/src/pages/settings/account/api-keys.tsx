import { useState } from "react";
import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { createApiKey, listApiKeys, revokeApiKey } from "@/features/plus/api";

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["plus", "api-keys"], queryFn: listApiKeys });

  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState<number | undefined>(undefined);
  const [newToken, setNewToken] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createApiKey({ name, expiresInDays: days }),
    onSuccess: async (res) => {
      setNewToken(res.token);
      setName("");
      setDays(undefined);
      setOpened(false);
      await qc.invalidateQueries({ queryKey: ["plus", "api-keys"] });
    },
    onError: (err: any) =>
      notifications.show({ message: err?.response?.data?.message ?? "Gagal membuat API key", color: "red" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: async () => {
      notifications.show({ message: "API key dicabut", color: "green" });
      await qc.invalidateQueries({ queryKey: ["plus", "api-keys"] });
    },
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={3}>API keys</Title>
        <Button onClick={() => setOpened(true)}>Buat API key</Button>
      </Group>

      <Text size="sm" c="dimmed">
        Dipakai untuk integrasi skrip/laporan. Kirim sebagai header{" "}
        <Code>Authorization: Bearer &lt;token&gt;</Code>. Token hanya ditampilkan sekali.
      </Text>

      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nama</Table.Th>
              <Table.Th>Dibuat</Table.Th>
              <Table.Th>Terakhir dipakai</Table.Th>
              <Table.Th>Kedaluwarsa</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(keys.data ?? []).map((k) => (
              <Table.Tr key={k.id}>
                <Table.Td>{k.name}</Table.Td>
                <Table.Td>{formatDate(k.createdAt)}</Table.Td>
                <Table.Td>{k.lastUsedAt ? formatDate(k.lastUsedAt) : "belum pernah"}</Table.Td>
                <Table.Td>{k.expiresAt ? formatDate(k.expiresAt) : "tidak ada"}</Table.Td>
                <Table.Td>
                  <Button size="compact-xs" color="red" variant="light" onClick={() => revoke.mutate(k.id)}>
                    Cabut
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {!keys.data?.length && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">
                    Belum ada API key.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Buat API key">
        <Stack>
          <TextInput
            label="Nama"
            placeholder="mis. backup-noc"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <NumberInput
            label="Berlaku (hari)"
            description="Kosongkan bila tanpa kedaluwarsa"
            min={1}
            max={3650}
            value={days}
            onChange={(v) => setDays(typeof v === "number" ? v : undefined)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Batal
            </Button>
            <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
              Buat
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!newToken} onClose={() => setNewToken(null)} title="Salin token ini sekarang">
        <Stack>
          <Alert color="yellow">Token hanya ditampilkan sekali dan tidak bisa dilihat lagi.</Alert>
          <Code block>{newToken}</Code>
          <CopyButton value={newToken ?? ""}>
            {({ copied, copy }) => (
              <Button onClick={copy} variant="default">
                {copied ? "Tersalin" : "Salin"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>
    </Stack>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
