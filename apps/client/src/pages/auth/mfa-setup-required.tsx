import { Container, Text, Title, Button } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/features/auth/components/auth-layout";

/**
 * Workspace yang mewajibkan MFA. v1: pendaftaran MFA dilakukan dari
 * Settings → Keamanan setelah login, jadi halaman ini hanya memberi arahan.
 */
export default function MfaSetupRequiredPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <Container size={420}>
        <Title order={1} size="h2" ta="center" fw={500} mb="sm">
          Workspace mewajibkan MFA
        </Title>
        <Text size="sm" c="dimmed" ta="center" mb="lg">
          Aktifkan authenticator dari menu Settings → Keamanan (MFA) setelah masuk.
        </Text>
        <Button fullWidth onClick={() => navigate("/login")}>
          Kembali ke login
        </Button>
      </Container>
    </AuthLayout>
  );
}
