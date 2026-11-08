import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService } from './ai.service';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: 'search_pages',
    description: 'Cari halaman wiki berdasarkan kata kunci (full-text).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'kata kunci pencarian' } },
      required: ['query'],
    },
  },
  {
    name: 'get_page',
    description: 'Ambil isi satu halaman berdasarkan pageId.',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string' } },
      required: ['pageId'],
    },
  },
  {
    name: 'list_spaces',
    description: 'Daftar space (ruang) yang ada di workspace.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/**
 * MCP server (Streamable HTTP, JSON-RPC 2.0) untuk agen.
 * Autentikasi memakai API key Docmost Plus (Authorization: Bearer <token>).
 */
@UseGuards(JwtAuthGuard)
@Controller('plus/mcp')
export class McpController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  async handle(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() req: JsonRpcRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // notifikasi tidak dibalas
    if (req?.method?.startsWith('notifications/')) {
      res.status(202);
      return null;
    }

    const id = req?.id ?? null;

    try {
      switch (req?.method) {
        case 'initialize':
          return ok(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'docmost-plus', version: '0.1.0' },
          });

        case 'tools/list':
          return ok(id, { tools: TOOLS });

        case 'tools/call': {
          const name = String((req.params as any)?.name ?? '');
          const args = ((req.params as any)?.arguments ?? {}) as Record<string, string>;

          if (name === 'search_pages') {
            const items = await this.aiService.searchPages(user, workspace, args.query ?? '');
            return ok(id, { content: [{ type: 'text', text: JSON.stringify(items) }] });
          }
          if (name === 'get_page') {
            const page = await this.aiService.getPage(user, workspace, args.pageId ?? '');
            return ok(id, { content: [{ type: 'text', text: JSON.stringify(page) }] });
          }
          if (name === 'list_spaces') {
            const spaces = await this.aiService.listSpaces(workspace);
            return ok(id, { content: [{ type: 'text', text: JSON.stringify(spaces) }] });
          }
          return err(id, -32602, `Tool tidak dikenal: ${name}`);
        }

        default:
          return err(id, -32601, `Method tidak dikenal: ${req?.method}`);
      }
    } catch (e) {
      return err(id, -32000, (e as Error).message ?? 'kesalahan internal');
    }
  }
}

function ok(id: string | number | null, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function err(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
