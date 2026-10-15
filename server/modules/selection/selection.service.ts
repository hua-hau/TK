import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from "@lark-apaas/fullstack-nestjs-core";
import { eq, desc, asc, count, and, inArray } from 'drizzle-orm';
import { batches, products } from "@server/database/schema";
import type {
  BatchInfo,
  BatchListResponse,
  BatchProgressResponse,
  DecisionType,
  ProductInfo,
  ProductListResponse,
  UploadResponse,
} from '@shared/api.interface';
import * as XLSX from 'xlsx';

const BATCH_SIZE = 2000;
const DECISIONS: DecisionType[] = ['untouched', 'keep', 'discard', 'pending'];

function shouldFilterCategory(category: string): boolean {
  if (!category) return false;
  if (category.startsWith('保健') || category.startsWith('食品饮料')) return true;
  if (category.includes('健康')) return true;
  return false;
}

function extractProductId(url: string): string | null {
  const match = url.match(/\/product\/(\d+)/);
  return match ? match[1] : null;
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : null;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

@Injectable()
export class SelectionService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async uploadAndParse(file: Express.Multer.File): Promise<UploadResponse> {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
    });

    // Skip header row
    const dataRows = rows.slice(1);
    const totalCount = dataRows.length;

    // Fix filename encoding (multer parses multipart filename as latin1 by default)
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Create batch
    const [batch] = await this.db
      .insert(batches)
      .values({
        fileName,
        totalCount,
        pendingCount: 0,
        status: 'processing',
      })
      .returning({ id: batches.id, fileName: batches.fileName });

    const filteredProducts: typeof products.$inferInsert[] = [];
    let sortIndex = 1;

    for (const row of dataRows) {
      const category = toStr(row[4]) ?? '';
      if (shouldFilterCategory(category)) continue;

      const productUrl = toStr(row[2]) ?? '';
      const productId = extractProductId(productUrl);
      if (!productId) continue;

      filteredProducts.push({
        batchId: batch.id,
        productId,
        title: toStr(row[0]) ?? '',
        region: toStr(row[1]),
        productUrl,
        imageUrl: toStr(row[3]),
        category,
        shopName: toStr(row[5]),
        shopType: toStr(row[6]),
        operationMode: toStr(row[7]),
        shopSales: toInt(row[8]),
        price: toStr(row[9]),
        priceBrl: toStr(row[10]),
        firstThreeDaysSales: toInt(row[11]),
        recentThreeDaysSales: toInt(row[12]),
        totalSales: toInt(row[13]),
        firstThreeDaysRevenue: toStr(row[14]),
        firstThreeDaysRevenueBrl: toStr(row[15]),
        recentThreeDaysRevenue: toStr(row[16]),
        recentThreeDaysRevenueBrl: toStr(row[17]),
        totalRevenue: toStr(row[18]),
        totalRevenueBrl: toStr(row[19]),
        influencerCount: toInt(row[20]),
        decision: 'untouched' as DecisionType,
        sortIndex,
      });
      sortIndex += 1;
    }

    // Batch insert
    const filteredCount = filteredProducts.length;
    for (let i = 0; i < filteredProducts.length; i += BATCH_SIZE) {
      const chunk = filteredProducts.slice(i, i + BATCH_SIZE);
      await this.db.insert(products).values(chunk);
    }

    // Update batch status
    await this.db
      .update(batches)
      .set({
        status: 'ready',
        pendingCount: filteredCount,
      })
      .where(eq(batches.id, batch.id));

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      totalCount,
      filteredCount,
    };
  }

  async getBatchList(): Promise<BatchListResponse> {
    const batchList = await this.db
      .select()
      .from(batches)
      .orderBy(desc(batches.createdAt));

    if (batchList.length === 0) {
      return { items: [] };
    }

    const batchIds = batchList.map((b) => b.id);

    // Group by batch_id and decision
    const decisionCounts = await this.db
      .select({
        batchId: products.batchId,
        decision: products.decision,
        count: count(),
      })
      .from(products)
      .where(inArray(products.batchId, batchIds))
      .groupBy(products.batchId, products.decision);

    const countsMap = new Map<string, Record<string, number>>();
    for (const row of decisionCounts) {
      if (!countsMap.has(row.batchId)) {
        countsMap.set(row.batchId, { untouched: 0, keep: 0, discard: 0, pending: 0 });
      }
      const m = countsMap.get(row.batchId)!;
      const dec = row.decision as DecisionType;
      if (DECISIONS.includes(dec)) {
        m[dec] = Number(row.count);
      }
    }

    const items: BatchInfo[] = batchList.map((b) => {
      const c = countsMap.get(b.id) ?? { untouched: 0, keep: 0, discard: 0, pending: 0 };
      return {
        id: b.id,
        fileName: b.fileName,
        totalCount: b.totalCount,
        pendingCount: b.pendingCount,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
        keepCount: c.keep,
        discardCount: c.discard,
        pendingDecisionCount: c.pending,
        untouchedCount: c.untouched,
      };
    });

    return { items };
  }

  async getBatchProgress(batchId: string): Promise<BatchProgressResponse> {
    const rows = await this.db
      .select({
        decision: products.decision,
        count: count(),
      })
      .from(products)
      .where(eq(products.batchId, batchId))
      .groupBy(products.decision);

    const result: Record<string, number> = {
      untouched: 0,
      keep: 0,
      discard: 0,
      pending: 0,
    };
    for (const row of rows) {
      const dec = row.decision as DecisionType;
      if (DECISIONS.includes(dec)) {
        result[dec] = Number(row.count);
      }
    }

    const total = result.untouched + result.keep + result.discard + result.pending;
    const processed = result.keep + result.discard + result.pending;

    return {
      total,
      keep: result.keep,
      discard: result.discard,
      pending: result.pending,
      untouched: result.untouched,
      processed,
    };
  }

  async getProducts(
    batchId: string,
    page: number,
    pageSize: number,
    filterDecision?: DecisionType,
  ): Promise<ProductListResponse> {
    const offset = (page - 1) * pageSize;

    const whereCondition = filterDecision
      ? and(eq(products.batchId, batchId), eq(products.decision, filterDecision))
      : eq(products.batchId, batchId);

    const [totalResult, itemsResult] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(products)
        .where(whereCondition),
      this.db
        .select()
        .from(products)
        .where(whereCondition)
        .orderBy(asc(products.sortIndex))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    const items: ProductInfo[] = itemsResult.map((p) => ({
      id: p.id,
      batchId: p.batchId,
      productId: p.productId,
      title: p.title,
      region: p.region,
      productUrl: p.productUrl,
      shopUrl: `https://shop.tiktok.com/view/product/${p.productId}?source=agency&region=br`,
      imageUrl: p.imageUrl,
      category: p.category,
      shopName: p.shopName,
      shopType: p.shopType,
      operationMode: p.operationMode,
      shopSales: p.shopSales,
      price: p.price,
      priceBrl: p.priceBrl,
      firstThreeDaysSales: p.firstThreeDaysSales,
      recentThreeDaysSales: p.recentThreeDaysSales,
      totalSales: p.totalSales,
      firstThreeDaysRevenue: p.firstThreeDaysRevenue,
      firstThreeDaysRevenueBrl: p.firstThreeDaysRevenueBrl,
      recentThreeDaysRevenue: p.recentThreeDaysRevenue,
      recentThreeDaysRevenueBrl: p.recentThreeDaysRevenueBrl,
      totalRevenue: p.totalRevenue,
      totalRevenueBrl: p.totalRevenueBrl,
      influencerCount: p.influencerCount,
      decision: p.decision as DecisionType,
      sortIndex: p.sortIndex,
    }));

    return { items, total, page, pageSize, filterDecision: filterDecision ?? null };
  }

  async setDecision(productId: string, decision: DecisionType): Promise<{ decision: DecisionType }> {
    // Get the product's batchId first
    const productResult = await this.db
      .select({ batchId: products.batchId })
      .from(products)
      .where(eq(products.id, productId));

    if (productResult.length === 0) {
      throw new NotFoundException('商品不存在');
    }

    const batchId = productResult[0].batchId;

    const updated = await this.db
      .update(products)
      .set({ decision })
      .where(eq(products.id, productId))
      .returning({ decision: products.decision });

    if (updated.length === 0) {
      throw new NotFoundException('商品不存在');
    }

    // Recalculate pendingCount (= untouched count) for the batch
    const untouchedResult = await this.db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.batchId, batchId), eq(products.decision, 'untouched')));

    const untouchedCount = Number(untouchedResult[0]?.count ?? 0);

    await this.db
      .update(batches)
      .set({ pendingCount: untouchedCount })
      .where(eq(batches.id, batchId));

    return { decision: updated[0].decision as DecisionType };
  }

  async exportBatch(batchId: string, decision: 'keep' | 'pending'): Promise<{ buffer: Buffer; fileName: string }> {
    const [batchResult, productRows] = await Promise.all([
      this.db.select({ fileName: batches.fileName }).from(batches).where(eq(batches.id, batchId)),
      this.db
        .select({
          title: products.title,
          category: products.category,
          shopName: products.shopName,
          priceBrl: products.priceBrl,
          productUrl: products.productUrl,
        })
        .from(products)
        .where(and(eq(products.batchId, batchId), eq(products.decision, decision)))
        .orderBy(asc(products.sortIndex)),
    ]);

    if (batchResult.length === 0) {
      throw new NotFoundException('批次不存在');
    }

    const baseName = batchResult[0].fileName.replace(/\.xlsx?$/i, '');
    const suffix = decision === 'keep' ? '要' : '待定';
    const fileName = `${baseName}_${suffix}.xlsx`;

    const exportData = productRows.map((p) => ({
      商品标题: p.title,
      商品类目: p.category ?? '',
      店铺名称: p.shopName ?? '',
      '售价(BRL)': p.priceBrl ?? '',
      商品链接: p.productUrl,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData, {
      header: ['商品标题', '商品类目', '店铺名称', '售价(BRL)', '商品链接'],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '选品');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return { buffer, fileName };
  }

  async proxyImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const allowedHosts = ['image.zhenghedata.com'];
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('无效的图片 URL');
    }
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      throw new BadRequestException('不支持的图片来源');
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MiaodaImageProxy/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`图片获取失败: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, contentType };
  }

  async deleteBatch(batchId: string): Promise<{ deletedBatchId: string }> {
    const batch = await this.db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.id, batchId));

    if (batch.length === 0) {
      throw new NotFoundException('批次不存在');
    }

    await this.db.delete(batches).where(eq(batches.id, batchId));

    return { deletedBatchId: batchId };
  }
}
