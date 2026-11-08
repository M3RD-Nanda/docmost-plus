import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { sql } from 'kysely';
import { EnvironmentService } from '../../integrations/environment/environment.service';

type Citation = { pageId: string; title: string; slugId: string; spaceId: string };

const MAX_PAGES = 8;
const MAX_CHARS_PER_PAGE = 1800;

const STOPWORDS = new Set([
  'apa','itu','yang','dan','di','ke','dari','untuk','dengan','adalah','siapa','berapa',
  'bagaimana','kapan','dimana','mana','saja','dalam','pada','ini','ada','bisa','jelaskan',
  'sebutkan','tolong','saya','kami','kita','mereka','the','is','are','what','who','how',
  'and','or','of','to','in','for','with','this','that','a','an','do','does',
]);

/**
 * AI tanya-jawab di atas wiki (RAG sederhana).
 * - Retrieval: full-text Postgres yang sudah ada (tsv) + filter hak akses halaman.
 * - LLM: OpenRouter (OpenAI-compatible), dikonfigurasi lewat env.
 * - Tanpa key: endpoint menjawab 503 dengan pesan jelas, bukan jawaban karangan.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly environment: EnvironmentService,
  ) {}

  private get apiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  private get model(): string {
    return process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  }

  private get baseUrl(): string {
    return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  }

  async retrieve(user: User, workspace: Workspace, query: string) {
    const q = (query ?? '').trim().slice(0, 300);
    if (q.length < 2) return { pages: [] as Citation[], context: '' };

    // ponytail: plainto_tsquery = AND, kalimat panjang tak pernah cocok.
    // Ambil kata kunci bermakna lalu gabung dengan OR + prefix match.
    const words = q
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .slice(0, 6);
    if (!words.length) return { pages: [] as Citation[], context: '' };

    const tsQuery = words.map((w) => `${w}:*`).join(' | ');

    const rows = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId', 'textContent'])
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .where(sql<boolean>`tsv @@ to_tsquery('simple', ${tsQuery})`)
      .orderBy(sql`ts_rank(tsv, to_tsquery('simple', ${tsQuery}))`, 'desc')
      .limit(MAX_PAGES)
      .execute();

    if (!rows.length) return { pages: [], context: '' };

    const accessible = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: rows.map((r) => r.id),
      userId: user.id,
      spaceId: null,
    });
    const allowed = new Set(accessible);
    const usable = rows.filter((r) => allowed.has(r.id));

    const pages: Citation[] = usable.map((r) => ({
      pageId: r.id,
      title: r.title ?? '(tanpa judul)',
      slugId: r.slugId,
      spaceId: r.spaceId,
    }));

    const context = usable
      .map(
        (r) =>
          `### ${r.title ?? '(tanpa judul)'}\n${(r.textContent ?? '')
            .replace(/\s+/g, ' ')
            .slice(0, MAX_CHARS_PER_PAGE)}`,
      )
      .join('\n\n');

    return { pages, context };
  }

  async chat(user: User, workspace: Workspace, dto: { chatId?: string; message: string }) {
    const message = (dto.message ?? '').trim();
    if (!message) throw new NotFoundException('Pesan kosong');

    let chatId = dto.chatId;
    if (!chatId) {
      const created = await this.db
        .insertInto('aiChats')
        .values({
          workspaceId: workspace.id,
          creatorId: user.id,
          title: message.slice(0, 60),
        })
        .returning('id')
        .executeTakeFirst();
      chatId = created?.id;
    }

    await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId: chatId as string,
        workspaceId: workspace.id,
        userId: user.id,
        role: 'user',
        content: message,
        tsv: sql<string>`to_tsvector('simple', ${message})`,
      })
      .execute();

    const { pages, context } = await this.retrieve(user, workspace, message);

    let answer: string;
    if (!getAuthorizedKey(this.apiKey)) {
      answer =
        'Fitur AI belum dikonfigurasi (OPENROUTER_API_KEY kosong). Administrator perlu mengisi variabel lingkungan tersebut.';
    } else if (!context) {
      answer = 'Belum ada halaman di wiki ini yang memuat hal tersebut.';
    } else {
      answer = await this.askModel(message, context);
    }

    await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId: chatId as string,
        workspaceId: workspace.id,
        userId: null,
        role: 'assistant',
        content: answer,
        metadata: JSON.stringify({ citations: pages.map((p) => p.pageId) }) as never,
      })
      .execute();

    return { chatId, answer, citations: pages };
  }

  private async askModel(question: string, context: string): Promise<string> {
    const system =
      'Anda asisten wiki internal. Jawab HANYA berdasarkan konteks yang diberikan. ' +
      'Sebutkan judul halaman yang Anda pakai dalam tanda [[Judul]]. ' +
      'Bila konteks tidak memuat jawabannya, jawab tepat: "Belum ada di wiki." ' +
      'Jawab ringkas dalam bahasa Indonesia.';

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        'X-Title': 'Docmost Plus',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `KONTEKS:\n${context}\n\nPERTANYAAN: ${question}` },
        ],
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      this.logger.warn(`OpenRouter ${res.status}: ${body}`);
      throw new ServiceUnavailableException(`OpenRouter menolak permintaan (${res.status})`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() || 'Belum ada di wiki.';
  }

  async listChats(user: User, workspace: Workspace) {
    return this.db
      .selectFrom('aiChats')
      .select(['id', 'title', 'updatedAt'])
      .where('workspaceId', '=', workspace.id)
      .where('creatorId', '=', user.id)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .execute();
  }

  async getMessages(user: User, workspace: Workspace, chatId: string) {
    const chat = await this.db
      .selectFrom('aiChats')
      .select('id')
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspace.id)
      .where('creatorId', '=', user.id)
      .executeTakeFirst();
    if (!chat) throw new NotFoundException('Chat tidak ditemukan');

    return this.db
      .selectFrom('aiChatMessages')
      .select(['id', 'role', 'content', 'createdAt'])
      .where('chatId', '=', chatId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  /** Dipakai endpoint MCP (dipanggil agen, bukan browser). */
  async searchPages(user: User, workspace: Workspace, query: string) {
    const { pages } = await this.retrieve(user, workspace, query);
    return pages.map((p) => ({
      pageId: p.pageId,
      title: p.title,
      slugId: p.slugId,
      url: `/s/${p.spaceId}/p/${p.slugId}`,
    }));
  }

  async getPage(user: User, workspace: Workspace, pageId: string) {
    const row = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId', 'textContent'])
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Halaman tidak ditemukan');

    const allowed = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [row.id],
      userId: user.id,
      spaceId: null,
    });
    if (!allowed.includes(row.id)) throw new NotFoundException('Halaman tidak ditemukan');

    return {
      pageId: row.id,
      title: row.title,
      slugId: row.slugId,
      spaceId: row.spaceId,
      text: (row.textContent ?? '').slice(0, 8000),
    };
  }

  async listSpaces(workspace: Workspace) {
    return this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'slug'])
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .execute();
  }
}

/** Key yang jelas placeholder dianggap kosong (mis. "sk-or-v1-xxx"). */
function getAuthorizedKey(key?: string): string | undefined {
  if (!key || key.length < 20) return undefined;
  return key;
}
