import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { addSsoProvider, deleteSsoProvider, listSsoProviders, setSsoProviderEnabled } from "@/features/plus/oidc-api";

export default function SsoProvidersPage() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["plus", "sso", "admin"], queryFn: listSsoProviders });
  const [opened, setOpened] = useState(false);
  const [form, setForm] = useState({ name: "", issuer: "", clientId: "", clientSecret: "", allowSignup: false });

  const create = useMutation({
    mutationFn: () => addSsoProvider(form),
    onSuccess: async () => {
      notifications.show({ message: "Provider SSO ditambahkan", color: "green" });
      setOpened(false);
      setForm({ name: "", issuer: "", clientId: "", clientSecret: "", allowSignup: false });
      await qc.invalidateQueries({ queryKey: ["plus", "sso"] });
    },
    onError: (err: any) =>
      notifications.show({ message: err?.response?.data?.message ?? "Gagal menyimpan provider", color: "red" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSsoProvider(id),
    onSuccess: async () => {
      notifications.show({ message: "Provider dihapus", color: "green" });
      await qc.invalidateQueries({ queryKey: ["plus", "sso"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setSsoProviderEnabled(v.id, v.enabled),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["plus", "sso"] }),
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={3}>SSO (OIDC)</Title>
        <Button onClick={() => setOpened(true)}>Tambah provider</Button>
      </Group>

      <Text size="sm" c="dimmed">
        Issuer harus https dan menyediakan <Code>/.well-known/openid-configuration</Code>.
        Redirect URI yang didaftarkan di IdP: <Code>{window.location.origin}/api/plus/sso/callback</Code>
      </Text>

      <Table.ScrollContainer minWidth={720}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nama</Table.Th>
              <Table.Th>Issuer</Table.Th>
              <Table.Th>Client ID</Table.Th>
              <Table.Th>Signup</Table.Th>
              <Table.Th>Aktif</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(providers.data ?? []).map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>{p.issuer}</Table.Td>
                <Table.Td>
                  <Code>{p.clientId}</Code>
                </Table.Td>
                <Table.Td>
                  <Badge color={p.allowSignup ? "blue" : "gray"}>{p.allowSignup ? "auto" : "undangan"}</Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={p.isEnabled}
                    onChange={(e) => toggle.mutate({ id: p.id, enabled: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="light" color="red" onClick={() => remove.mutate(p.id)}>
                    Hapus
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {!providers.data?.length && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">
                    Belum ada provider SSO.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Tambah provider OIDC">
        <Stack>
          <TextInput
            label="Nama tampilan"
            placeholder="mis. Login IKH"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            required
          />
          <TextInput
            label="Issuer"
            placeholder="https://auth.contoh.id/application/o/docmost/"
            value={form.issuer}
            onChange={(e) => setForm({ ...form, issuer: e.currentTarget.value })}
            required
          />
          <TextInput
            label="Client ID"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.currentTarget.value })}
            required
          />
          <TextInput
            label="Client secret"
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm({ ...form, clientSecret: e.currentTarget.value })}
            required
          />
          <Switch
            label="Izinkan pembuatan akun otomatis (auto-signup)"
            checked={form.allowSignup}
            onChange={(e) => setForm({ ...form, allowSignup: e.currentTarget.checked })}
          />
          <Alert color="gray" variant="light">
            Tanpa auto-signup, hanya email yang sudah jadi anggota workspace yang bisa masuk.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Batal
            </Button>
            <Button
              loading={create.isPending}
              disabled={!form.name || !form.issuer || !form.clientId || !form.clientSecret}
              onClick={() => create.mutate()}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
