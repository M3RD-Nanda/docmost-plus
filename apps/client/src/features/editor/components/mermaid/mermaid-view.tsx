import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Box, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
});

let seq = 0;

export default function MermaidView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const code = String(node.attrs.code ?? "");
  const align = (node.attrs.align ?? "center") as string;

  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(code);

  useEffect(() => {
    setDraft(code);
    if (!code.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    let alive = true;
    const id = `docmost-mermaid-${Date.now()}-${seq++}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (alive) {
          setSvg(svg);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (alive) {
          setSvg("");
          setError(err.message);
        }
        document.getElementById(id)?.remove();
      });
    return () => {
      alive = false;
    };
  }, [code]);

  function save() {
    updateAttributes({ code: draft });
    setOpened(false);
  }

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <NodeViewWrapper>
      <Box
        style={{
          display: "flex",
          justifyContent: justify,
          padding: 4,
          borderRadius: 6,
          outline: selected ? "2px solid var(--mantine-color-blue-4)" : "none",
        }}
        onClick={() => editor.isEditable && setOpened(true)}
      >
        {svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <Text size="sm" c="dimmed" py="sm">
            {error
              ? `Diagram Mermaid gagal dirender: ${error.slice(0, 120)}`
              : "Klik untuk menulis diagram Mermaid"}
          </Text>
        )}
      </Box>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Diagram Mermaid" size="lg">
        <Stack>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder={"graph TD\n  A[Mulai] --> B[Selesai]"}
            minRows={12}
            autosize
            ff="monospace"
          />
          <Text size="xs" c="dimmed">
            Sintaks: flowchart, sequence, class, state, ER, gantt.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Batal
            </Button>
            <Button onClick={save}>Simpan</Button>
          </Group>
        </Stack>
      </Modal>
    </NodeViewWrapper>
  );
}
