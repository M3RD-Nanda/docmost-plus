import { useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Image,
  Modal,
  PinInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  disableMfa,
  enableMfa,
  getMfaStatus,
  regenerateBackupCodes,
  startMfaSetup,
  type MfaSetupResult,
} from "@/features/plus/api";

export default function MfaSettingsPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["plus", "mfa", "status"], queryFn: getMfaStatus });

  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [actionModal, setActionModal] = useState<"disable" | "regenerate" | null>(null);

  async function beginSetup() {
    setBusy(true);
    try {
      setSetup(await startMfaSetup());
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message ?? "Gagal memulai setup", color: "red" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setBusy(true);
    try {
      const res = await enableMfa(code);
      setBackupCodes(res.backupCodes);
      setSetup(null);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["plus", "mfa", "status"] });
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message ?? "Kode tidak valid", color: "red" });
    } finally {
      setBusy(false);
    }
  }

  async function runAction() {
    setBusy(true);
    try {
      if (actionModal === "disable") {
        await disableMfa(code);
        notifications.show({ message: "MFA dinonaktifkan", color: "green" });
      } else {
        const res = await regenerateBackupCodes(code);
        setBackupCodes(res.backupCodes);
      }
      setActionModal(null);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["plus", "mfa", "status"] });
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message ?? "Kode tidak valid", color: "red" });
    } finally {
      setBusy(false);
    }
  }

  const enabled = status.data?.enabled;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={3}>Keamanan (MFA)</Title>
        <Badge color={enabled ? "green" : "gray"}>{enabled ? "Aktif" : "Nonaktif"}</Badge>
      </Group>

      <Text size="sm" c="dimmed">
        Autentikasi dua langkah memakai aplikasi authenticator (Google Authenticator, Authy,
        1Password, dll). Setelah aktif, login akan meminta kode 6 digit.
      </Text>

      {!enabled && !setup && (
        <Group>
          <Button loading={busy} onClick={beginSetup}>
            Aktifkan MFA
          </Button>
        </Group>
      )}

      {setup && (
        <Stack gap="sm">
          <Divider label="Langkah 1 — pindai QR" labelPosition="left" />
          {setup.qrCodeDataUrl ? (
            <Image src={setup.qrCodeDataUrl} alt="QR MFA" w={220} h={220} />
          ) : (
            <Alert color="yellow">QR tidak tersedia — gunakan kunci manual di bawah.</Alert>
          )}
          <Group gap="xs">
            <Text size="sm">Kunci manual:</Text>
            <Code>{setup.manualKey}</Code>
            <CopyButton value={setup.manualKey}>
              {({ copied, copy }) => (
                <Anchor size="sm" onClick={copy}>
                  {copied ? "Tersalin" : "Salin"}
                </Anchor>
              )}
            </CopyButton>
          </Group>

          <Divider label="Langkah 2 — masukkan kode dari aplikasi" labelPosition="left" />
          <PinInput length={6} type="number" value={code} onChange={setCode} oneTimeCode />
          <Group>
            <Button loading={busy} onClick={confirmEnable} disabled={code.length < 6}>
              Aktifkan
            </Button>
            <Button variant="default" onClick={() => { setSetup(null); setCode(""); }}>
              Batal
            </Button>
          </Group>
        </Stack>
      )}

      {enabled && (
        <Group>
          <Button variant="default" onClick={() => setActionModal("regenerate")}>
            Buat ulang kode cadangan
          </Button>
          <Button color="red" variant="light" onClick={() => setActionModal("disable")}>
            Nonaktifkan MFA
          </Button>
        </Group>
      )}

      <Modal
        opened={!!backupCodes}
        onClose={() => setBackupCodes(null)}
        title="Simpan kode cadangan ini"
      >
        <Stack>
          <Alert color="yellow">
            Kode cadangan hanya ditampilkan sekali. Setiap kode bisa dipakai satu kali bila
            authenticator tidak tersedia.
          </Alert>
          <Code block>{backupCodes?.join("\n")}</Code>
          <CopyButton value={(backupCodes ?? []).join("\n")}>
            {({ copied, copy }) => (
              <Button variant="default" onClick={copy}>
                {copied ? "Tersalin" : "Salin semua"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>

      <Modal
        opened={!!actionModal}
        onClose={() => { setActionModal(null); setCode(""); }}
        title={actionModal === "disable" ? "Nonaktifkan MFA" : "Buat ulang kode cadangan"}
      >
        <Stack>
          <Text size="sm">Masukkan kode authenticator untuk konfirmasi.</Text>
          <PinInput length={6} type="number" value={code} onChange={setCode} oneTimeCode />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setActionModal(null); setCode(""); }}>
              Batal
            </Button>
            <Button loading={busy} onClick={runAction} disabled={code.length < 6}>
              Konfirmasi
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
