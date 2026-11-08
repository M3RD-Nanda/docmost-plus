import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconLayoutKanban, IconTable } from "@tabler/icons-react";
import {
  addProperty,
  addRow,
  addView,
  deleteRow,
  getBase,
  listRows,
  patchRow,
  removeProperty,
  type BaseProperty,
  type BaseRow,
} from "@/features/plus/base-api";

// Kysely CamelCasePlugin mengubah kunci JSONB saat dibaca (st_ab → stAb).
// Semua akses sel harus lewat helper ini supaya konsisten baca/tulis.
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const getCell = (cells: Record<string, any>, id: string) => cells[camel(id)] ?? cells[id];

const TYPES = [
  { value: "text", label: "Teks" },
  { value: "number", label: "Angka" },
  { value: "select", label: "Pilihan" },
  { value: "date", label: "Tanggal" },
  { value: "checkbox", label: "Centang" },
];

export default function BasePage() {
  const { pageId = "" } = useParams();

  const [properties, setProperties] = useState<BaseProperty[]>([]);
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"table" | "kanban">("table");
  const [groupBy, setGroupBy] = useState<string | null>(null);

  const [propModal, setPropModal] = useState(false);
  const [newProp, setNewProp] = useState({ name: "", type: "text" });

  async function load() {
    setLoading(true);
    try {
      const schema = await getBase(pageId);
      setProperties(schema.properties ?? []);
      const data = await listRows(pageId);
      setRows(data.items ?? []);
      const kanban = (schema.views ?? []).find((v) => v.type === "kanban");
      if (kanban) {
        setViewType("kanban");
        setGroupBy((kanban.config as any)?.groupBy ?? null);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Gagal memuat basis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (pageId) void load();
  }, [pageId]);

  async function saveCell(row: BaseRow, propId: string, value: unknown) {
    const cells = { ...row.cells, [camel(propId)]: value };
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, cells } : r)));
    try {
      await patchRow(pageId, row.id, cells);
    } catch {
      notifications.show({ message: "Gagal menyimpan sel", color: "red" });
      await load();
    }
  }

  async function createRow() {
    try {
      const created: any = await addRow(pageId, {});
      setRows((prev) => [...prev, { id: created.id, cells: created.cells ?? {}, position: created.position }]);
    } catch {
      notifications.show({ message: "Gagal menambah baris", color: "red" });
    }
  }

  async function createProperty() {
    try {
      // ponytail: kolom "Pilihan" dibuat dengan 3 opsi bawaan; editor opsi menyusul.
      const typeOptions =
        newProp.type === "select"
          ? {
              options: [
                { id: "todo", name: "Todo" },
                { id: "proses", name: "Proses" },
                { id: "selesai", name: "Selesai" },
              ],
            }
          : undefined;
      await addProperty(pageId, { name: newProp.name, type: newProp.type, typeOptions });
      setPropModal(false);
      setNewProp({ name: "", type: "text" });
      await load();
    } catch (e: any) {
      notifications.show({ message: e?.response?.data?.message ?? "Gagal menambah kolom", color: "red" });
    }
  }

  const selectProps = properties.filter((p) => p.type === "select");
  const groupProp = selectProps.find((p) => p.id === groupBy) ?? selectProps[0];

  const kanbanGroups = useMemo(() => {
    if (!groupProp) return [];
    const options = groupProp.typeOptions?.options?.map((o) => o.name) ?? [];
    const names = new Set<string>(options);
    rows.forEach((r) => {
      const v = getCell(r.cells, groupProp.id);
      if (typeof v === "string" && v) names.add(v);
    });
    return [...names];
  }, [groupProp, rows]);

  async function moveRow(row: BaseRow, group: string) {
    if (!groupProp) return;
    await saveCell(row, groupProp.id, group);
  }

  if (error) return <Container py="xl"><Alert color="red">{error}</Alert></Container>;

  return (
    <Container fluid py="lg" px="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={3}>Basis</Title>
            <Badge variant="light">{rows.length} baris</Badge>
            {loading && <Badge color="gray">memuat…</Badge>}
          </Group>
          <Group gap="xs">
            <Button
              size="xs"
              variant={viewType === "table" ? "filled" : "default"}
              leftSection={<IconTable size={14} />}
              onClick={() => setViewType("table")}
            >
              Tabel
            </Button>
            <Button
              size="xs"
              variant={viewType === "kanban" ? "filled" : "default"}
              leftSection={<IconLayoutKanban size={14} />}
              onClick={() => setViewType("kanban")}
              disabled={!selectProps.length}
            >
              Kanban
            </Button>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setPropModal(true)}>
              Kolom
            </Button>
            <Button size="xs" onClick={createRow} leftSection={<IconPlus size={14} />}>
              Baris
            </Button>
          </Group>
        </Group>

        {!selectProps.length && viewType === "kanban" && (
          <Alert color="yellow">Kanban butuh minimal satu kolom bertipe "Pilihan".</Alert>
        )}

        {viewType === "table" ? (
          <Table.ScrollContainer minWidth={640}>
            <Table withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {properties.map((p) => (
                    <Table.Th key={p.id}>
                      <Group gap={4} justify="space-between">
                        <Text size="xs" fw={600}>
                          {p.name}
                        </Text>
                        <Tooltip label="Hapus kolom">
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={async () => {
                              await removeProperty(pageId, p.id);
                              await load();
                            }}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Th>
                  ))}
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    {properties.map((p) => (
                      <Table.Td key={p.id}>
                        <CellEditor
                          property={p}
                          value={getCell(row.cells, p.id)}
                          onSave={(v) => saveCell(row, p.id, v)}
                        />
                      </Table.Td>
                    ))}
                    <Table.Td>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={async () => {
                          await deleteRow(pageId, row.id);
                          setRows((prev) => prev.filter((r) => r.id !== row.id));
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!rows.length && (
                  <Table.Tr>
                    <Table.Td colSpan={properties.length + 1}>
                      <Text size="sm" c="dimmed">
                        Belum ada baris. Klik "Baris" untuk mulai.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: "auto" }}>
            {kanbanGroups.map((group) => (
              <Card
                key={group}
                withBorder
                w={260}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const rowId = e.dataTransfer.getData("text/row-id");
                  const row = rows.find((r) => r.id === rowId);
                  if (row) void moveRow(row, group);
                }}
              >
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>
                    {group}
                  </Text>
                  <Badge size="xs" variant="light">
                    {rows.filter((r) => getCell(r.cells, groupProp?.id ?? "") === group).length}
                  </Badge>
                </Group>
                <Stack gap="xs">
                  {rows
                    .filter((r) => (groupProp ? getCell(r.cells, groupProp.id) === group : false))
                    .map((row) => (
                      <Card
                        key={row.id}
                        padding="xs"
                        withBorder
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/row-id", row.id)}
                      >
                        <Text size="sm">
                          {String(getCell(row.cells, properties.find((p) => p.type === "text")?.id ?? "") ?? "(kosong)")}
                        </Text>
                      </Card>
                    ))}
                </Stack>
              </Card>
            ))}
          </Group>
        )}
      </Stack>

      <Modal opened={propModal} onClose={() => setPropModal(false)} title="Tambah kolom">
        <Stack>
          <TextInput
            label="Nama kolom"
            value={newProp.name}
            onChange={(e) => setNewProp({ ...newProp, name: e.currentTarget.value })}
          />
          <Select
            label="Tipe"
            data={TYPES}
            value={newProp.type}
            onChange={(v) => setNewProp({ ...newProp, type: v ?? "text" })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPropModal(false)}>
              Batal
            </Button>
            <Button disabled={!newProp.name.trim()} onClick={createProperty}>
              Simpan
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

function CellEditor({
  property,
  value,
  onSave,
}: {
  property: BaseProperty;
  value: unknown;
  onSave: (v: unknown) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  if (property.type === "checkbox") {
    return <Checkbox checked={Boolean(value)} onChange={(e) => onSave(e.currentTarget.checked)} />;
  }

  if (property.type === "select") {
    const options = property.typeOptions?.options?.map((o) => o.name) ?? [];
    const data = options.length ? options : ["Belum ditentukan"];
    return (
      <Select
        size="xs"
        variant="unstyled"
        placeholder="—"
        value={(value as string) ?? null}
        data={data}
        onChange={(v) => onSave(v)}
      />
    );
  }

  return (
    <TextInput
      size="xs"
      variant="unstyled"
      placeholder="—"
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        const next = property.type === "number" ? (draft === "" ? null : Number(draft)) : draft;
        if (String(value ?? "") !== String(next ?? "")) onSave(next);
      }}
      type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"}
    />
  );
}
