import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Container, PinInput, Stack, Text, Title, Anchor } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { verifyMfa } from "@/features/plus/api";

/**
 * Langkah kedua login (dipakai rute /login/mfa yang sudah ada di app-route).
 * Token tantangan (5 menit) diterima dari halaman login lewat state router.
 */
export default function MfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { mfaToken?: string } | null;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!state?.mfaToken) {
      notifications.show({ message: "Sesi MFA kedaluwarsa, silakan login ulang.", color: "red" });
      navigate("/login");
      return;
    }
    setLoading(true);
    try {
      await verifyMfa({ mfaToken: state.mfaToken, code });
      // Cookie sesi sudah terpasang; reload agar seluruh state aplikasi segar.
      window.location.assign("/");
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? "Kode MFA tidak valid",
        color: "red",
      });
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <Container size={420}>
        <Title order={1} size="h2" ta="center" fw={500} mb="xs">
          Verifikasi dua langkah
        </Title>
        <Text size="sm" c="dimmed" ta="center" mb="lg">
          Masukkan 6 digit dari aplikasi authenticator, atau salah satu kode cadangan.
        </Text>

        <Stack align="center">
          <PinInput
            length={6}
            type="number"
            size="md"
            value={code}
            onChange={setCode}
            onComplete={submit}
            autoFocus
            oneTimeCode
          />
          <Button fullWidth loading={loading} onClick={submit} disabled={code.length < 6}>
            Verifikasi
          </Button>
          <Anchor size="sm" onClick={() => navigate("/login")}>
            Kembali ke login
          </Anchor>
        </Stack>
      </Container>
    </AuthLayout>
  );
}
