import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { StorageService } from '../../integrations/storage/storage.service';

const MAX_TEXT = 2_000_000; // ponytail: batas kolom; dokumen >2 MB teks dipotong
const BATCH = 50;

/**
 * Ekstraktor teks lampiran — mengisi `attachments.text_content` dan `attachments.tsv`.
 * Pencarian lampiran di core (`search.service.ts`) sudah memakai kolom ini,
 * jadi tidak ada endpoint pencarian baru yang perlu dibuat.
 *
 * Dipanggil core lewat slot `require('.../ee/attachments-ee/attachment-ee.service')`
 * yang sudah diarahkan ke modul ini.
 */
@Injectable()
export class AttachmentEeService {
  private readonly logger = new Logger(AttachmentEeService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get storage(): StorageService {
    return this.moduleRef.get(StorageService, { strict: false });
  }

  async indexAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.db
      .selectFrom('attachments')
      .select(['id', 'fileName', 'filePath', 'mimeType', 'fileExt'])
      .where('id', '=', attachmentId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!attachment) return;

    const text = await this.extractText(attachment.filePath, {
      mimeType: attachment.mimeType,
      fileExt: attachment.fileExt,
      fileName: attachment.fileName,
    });

    if (text === null) return; // tipe tak didukung: biarkan kosong

    await this.db
      .updateTable('attachments')
      .set({
        textContent: text,
        tsv: sql<string>`to_tsvector('simple', ${text})`,
      } as never)
      .where('id', '=', attachmentId)
      .execute();
  }

  /** Backfill: proses semua lampiran workspace yang belum punya tsv. */
  async indexAttachments(workspaceId: string): Promise<void> {
    let processed = 0;
    for (;;) {
      const rows = await this.db
        .selectFrom('attachments')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where('tsv', 'is', null)
        .limit(BATCH)
        .execute();

      if (!rows.length) break;

      for (const row of rows) {
        try {
          await this.indexAttachment(row.id);
        } catch (err) {
          this.logger.warn(`Gagal mengindeks lampiran ${row.id}: ${(err as Error).message}`);
          // tandai agar tidak diulang terus: simpan string kosong
          await this.db
            .updateTable('attachments')
            .set({ textContent: '', tsv: sql<string>`to_tsvector('simple', '')` } as never)
            .where('id', '=', row.id)
            .execute();
        }
      }

      processed += rows.length;
      if (rows.length < BATCH) break;
    }

    this.logger.log(`Indeks lampiran selesai: ${processed} berkas (workspace ${workspaceId})`);
  }

  private async extractText(
    filePath: string,
    meta: { mimeType?: string | null; fileExt?: string | null; fileName?: string | null },
  ): Promise<string | null> {
    const ext = (meta.fileExt || meta.fileName?.split('.').pop() || '').toLowerCase();
    const buffer = await this.storage.read(filePath);

    let raw: string | null = null;

    if (ext === 'pdf' || meta.mimeType === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      raw = parsed?.text ?? '';
    } else if (
      ext === 'docx' ||
      meta.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth');
      const parsed = await mammoth.extractRawText({ buffer });
      raw = parsed?.value ?? '';
    } else if (['txt', 'md', 'csv', 'json', 'log'].includes(ext) || meta.mimeType?.startsWith('text/')) {
      raw = buffer.toString('utf8');
    }

    if (raw === null) return null;

    // rapikan spasi berlebih supaya tsvector tidak membengkak
    const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    return cleaned;
  }
}
