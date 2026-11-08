import { useEffect, useState } from "react";
import { Button, Group, Stack, Divider, Text } from "@mantine/core";
import api from "@/lib/api-client";

type Provider = { id: string; name: string };

/**
 * Tombol SSO OIDC di halaman login (pengganti komponen EE).
 * Alur: klik → ambil URL otorisasi → redirect ke IdP.
 */
export default function PlusSsoButtons() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/plus/sso/providers")
      .then((res: any) => {
        const list = res?.data?.items ?? res?.data ?? res?.items ?? res ?? [];
        if (alive && Array.isArray(list)) setProviders(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function start(providerId: string) {
    setLoading(providerId);
    try {
      const res: any = await api.get(`/plus/sso/${providerId}/authorize`);
      const url = res?.data?.url ?? res?.url;
      if (url) window.location.assign(url);
    } finally {
      setLoading(null);
    }
  }

  if (!providers.length) return null;

  return (
    <Stack gap="xs" mb="md">
      {providers.map((p) => (
        <Button
          key={p.id}
          variant="default"
          fullWidth
          loading={loading === p.id}
          onClick={() => start(p.id)}
        >
          Masuk dengan {p.name}
        </Button>
      ))}
      <Group gap="xs" my="xs">
        <Divider style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">
          atau
        </Text>
        <Divider style={{ flex: 1 }} />
      </Group>
    </Stack>
  );
}
