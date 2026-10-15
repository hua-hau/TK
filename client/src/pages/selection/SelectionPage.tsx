import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  QrCode,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  RefreshCcw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { resolveAppUrl } from '@lark-apaas/client-toolkit/utils/resolveAppUrl';
import { toast } from 'sonner';

import { selection } from '@client/src/api';
import { Image } from '@client/src/components/ui/image';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import type {
  BatchProgressResponse,
  DecisionType,
  ProductInfo,
} from '@shared/api.interface';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';

const PAGE_SIZE = 20;

const DECISION_LABEL: Record<DecisionType, string> = {
  untouched: '未处理',
  keep: '要',
  discard: '弃',
  pending: '待定',
};

const DECISION_BG_CLASS: Record<DecisionType, string> = {
  untouched: 'bg-gray-400',
  keep: 'bg-green-500',
  discard: 'bg-red-500',
  pending: 'bg-amber-400',
};

const DECISION_TEXT_CLASS: Record<DecisionType, string> = {
  untouched: 'text-white',
  keep: 'text-white',
  discard: 'text-white',
  pending: 'text-gray-900',
};

type FilterDecision = DecisionType | null;

interface StatItem {
  key: FilterDecision;
  label: string;
  value: number;
  activeBg: string;
  activeText: string;
  barColor: string;
}

// 图片代理：将原始图片 URL 转换为后端代理地址（同域，绕过手机端网络限制）
function getImageProxyUrl(originalUrl: string | null): string | null {
  if (!originalUrl) return null;
  return resolveAppUrl(`/api/selection/image-proxy?url=${encodeURIComponent(originalUrl)}`);
}

// 价格格式化：避免 R$ 重复前缀
function formatPrice(
  priceBrl: string | null,
  price: string | null,
): string {
  const value = priceBrl ?? price;
  if (!value) return '--';
  if (value.includes('R$')) return value;
  return `R$ ${value}`;
}

const SelectionPage = () => {
  const { batchId = '' } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [progress, setProgress] = useState<BatchProgressResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [indexInput, setIndexInput] = useState('');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [filterDecision, setFilterDecision] = useState<FilterDecision>(null);
  const [jumpPanelOpen, setJumpPanelOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, number>>({});

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoad = useRef(true);
  const visibleRatios = useRef<Map<string, number>>(new Map());

  const processedCount = progress?.processed ?? 0;
  const totalCount = progress?.total ?? 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1;
  const pageStartIdx = (currentPage - 1) * PAGE_SIZE + 1;
  const pageEndIdx = Math.min(currentPage * PAGE_SIZE, totalCount);

  const filterLabel = useMemo(() => {
    if (filterDecision === null) return '全部';
    return DECISION_LABEL[filterDecision];
  }, [filterDecision]);

  const filterCount = useMemo(() => {
    if (!progress) return 0;
    if (filterDecision === null) return progress.total;
    return progress[filterDecision] ?? 0;
  }, [progress, filterDecision]);

  const stats = useMemo<StatItem[]>(
    () => [
      {
        key: 'keep',
        label: '要',
        value: progress?.keep ?? 0,
        activeBg: 'bg-green-50',
        activeText: 'text-green-700',
        barColor: 'bg-green-500',
      },
      {
        key: 'discard',
        label: '弃',
        value: progress?.discard ?? 0,
        activeBg: 'bg-red-50',
        activeText: 'text-red-700',
        barColor: 'bg-red-500',
      },
      {
        key: 'pending',
        label: '待定',
        value: progress?.pending ?? 0,
        activeBg: 'bg-amber-50',
        activeText: 'text-amber-700',
        barColor: 'bg-amber-400',
      },
      {
        key: 'untouched',
        label: '剩余',
        value: progress?.untouched ?? 0,
        activeBg: 'bg-gray-100',
        activeText: 'text-gray-700',
        barColor: 'bg-gray-400',
      },
    ],
    [progress],
  );

  const currentProduct = useMemo(() => {
    if (!currentProductId) return null;
    return products.find((p) => p.id === currentProductId) ?? null;
  }, [currentProductId, products]);

  const fetchProgress = useCallback(async () => {
    if (!batchId) return;
    try {
      const data = await selection.getBatchProgress(batchId);
      setProgress(data);
    } catch (error) {
      logger.error('刷新进度失败', error);
    }
  }, [batchId]);

  const loadPage = useCallback(
    async (page: number) => {
      if (!batchId || loading) return;
      setLoading(true);
      try {
        const data = await selection.getProducts(
          batchId,
          page,
          PAGE_SIZE,
          filterDecision ?? undefined,
        );
        setProducts((prev) => {
          if (page === 1) return data.items;
          // 避免重复
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = data.items.filter(
            (item) => !existingIds.has(item.id),
          );
          return [...prev, ...newItems];
        });
        setCurrentPage(page);
        setHasMore(data.items.length === PAGE_SIZE);
      } catch (error) {
        logger.error('加载商品失败', error);
        toast.error('加载商品失败');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchId, loading, filterDecision],
  );

  // 初始加载 & 筛选切换
  useEffect(() => {
    if (!batchId) return;
    isInitialLoad.current = true;
    setProducts([]);
    setHasMore(true);
    setCurrentPage(1);
    setCurrentProductId(null);
    visibleRatios.current.clear();
    fetchProgress();
    loadPage(1).finally(() => {
      isInitialLoad.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, filterDecision]);

  // IntersectionObserver 加载更多
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry.isIntersecting &&
          hasMore &&
          !loading &&
          !isInitialLoad.current
        ) {
          loadPage(currentPage + 1);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, currentPage, loadPage]);

  // IntersectionObserver 追踪当前商品（最可见的那个）
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-product-id');
          if (!id) continue;
          if (entry.isIntersecting) {
            visibleRatios.current.set(id, entry.intersectionRatio);
          } else {
            visibleRatios.current.delete(id);
          }
        }
        // 选出可见比例最高的作为当前商品
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibleRatios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId && bestRatio > 0.2) {
          setCurrentProductId(bestId);
        }
      },
      { threshold: [0.1, 0.25, 0.5, 0.75, 0.9] },
    );

    for (const [id, el] of cardRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [products.length]);

  const handleImageError = useCallback((productId: string) => {
    setImageErrors((prev) => ({ ...prev, [productId]: Date.now() }));
  }, []);

  const handleImageRetry = useCallback((productId: string) => {
    setImageErrors((prev) => ({ ...prev, [productId]: Date.now() }));
  }, []);

  const handleDecision = useCallback(
    async (productId: string, decision: DecisionType) => {
      const prevProducts = products;
      const currentIndex = prevProducts.findIndex((p) => p.id === productId);

      // 筛选模式下，若判定结果不等于当前筛选值，从列表移除（乐观更新）
      if (filterDecision !== null && decision !== filterDecision) {
        setProducts((prev) => prev.filter((p) => p.id !== productId));

        // 筛选待定且改成要/弃，自动滚动到下一个
        if (
          filterDecision === 'pending' &&
          (decision === 'keep' || decision === 'discard') &&
          currentIndex >= 0
        ) {
          const remainingAfter = prevProducts
            .slice(currentIndex + 1)
            .filter((p) => p.decision === filterDecision);
          if (remainingAfter.length > 0) {
            const nextProduct = remainingAfter[0];
            const nextEl = cardRefs.current.get(nextProduct.id);
            if (nextEl) {
              setTimeout(() => {
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }
          }
        }
      } else {
        // 非筛选模式或判定仍属于当前筛选，原地更新 + 滚动到下一个
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, decision } : p)),
        );
        if (currentIndex >= 0 && currentIndex < prevProducts.length - 1) {
          const nextProduct = prevProducts[currentIndex + 1];
          const nextEl = cardRefs.current.get(nextProduct.id);
          if (nextEl) {
            setTimeout(() => {
              nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }
        }
      }

      try {
        await selection.setProductDecision(productId, decision);
        await fetchProgress();
      } catch (error) {
        logger.error('判定失败', error);
        toast.error('判定失败，请重试');
        // 回滚
        setProducts((prev) => {
          const found = prev.find((p) => p.id === productId);
          if (found) {
            return prev.map((p) =>
              p.id === productId ? { ...p, decision: 'untouched' } : p,
            );
          }
          // 该商品已被移除，加回来
          const original = prevProducts.find((p) => p.id === productId);
          if (original) {
            return [...prev, { ...original, decision: 'untouched' }];
          }
          return prev;
        });
        fetchProgress();
      }
    },
    [products, fetchProgress, filterDecision],
  );

  const handleJumpPage = useCallback(async () => {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 1) {
      toast.error('请输入有效的页码');
      return;
    }
    if (page > totalPages) {
      toast.error(`页码超出范围，共 ${totalPages} 页`);
      return;
    }
    setLoading(true);
    try {
      const allItems: ProductInfo[] = [];
      for (let p = 1; p <= page; p++) {
        const data = await selection.getProducts(
          batchId,
          p,
          PAGE_SIZE,
          filterDecision ?? undefined,
        );
        allItems.push(...data.items);
        if (data.items.length < PAGE_SIZE) break;
      }
      setProducts(allItems);
      setCurrentPage(page);
      setHasMore(page < totalPages && allItems.length === page * PAGE_SIZE);

      // 滚动到该页第一个商品
      const firstIdx = (page - 1) * PAGE_SIZE;
      const firstItem = allItems[firstIdx];
      if (firstItem) {
        setTimeout(() => {
          const el = cardRefs.current.get(firstItem.id);
          el?.scrollIntoView({
            behavior: 'instant' as ScrollBehavior,
            block: 'start',
          });
        }, 50);
      }
    } catch (error) {
      logger.error('跳转失败', error);
      toast.error('跳转失败');
    } finally {
      setLoading(false);
    }
  }, [pageInput, batchId, totalPages, filterDecision]);

  const handleJumpIndex = useCallback(async () => {
    const index = parseInt(indexInput, 10);
    if (isNaN(index) || index < 1) {
      toast.error('请输入有效的商品序号');
      return;
    }
    if (index > totalCount) {
      toast.error(`序号超出范围，共 ${totalCount} 个商品`);
      return;
    }
    const targetPage = Math.ceil(index / PAGE_SIZE);
    setLoading(true);
    try {
      const allItems: ProductInfo[] = [];
      for (let page = 1; page <= targetPage; page++) {
        const data = await selection.getProducts(
          batchId,
          page,
          PAGE_SIZE,
          filterDecision ?? undefined,
        );
        allItems.push(...data.items);
        if (data.items.length < PAGE_SIZE) break;
      }
      setProducts(allItems);
      setCurrentPage(targetPage);
      setHasMore(
        targetPage < totalPages && allItems.length === targetPage * PAGE_SIZE,
      );

      // 滚动到目标商品
      const targetItem = allItems[index - 1];
      if (targetItem) {
        setTimeout(() => {
          const el = cardRefs.current.get(targetItem.id);
          el?.scrollIntoView({
            behavior: 'instant' as ScrollBehavior,
            block: 'start',
          });
        }, 50);
      }
    } catch (error) {
      logger.error('跳转失败', error);
      toast.error('跳转失败');
    } finally {
      setLoading(false);
    }
  }, [indexInput, batchId, totalCount, totalPages, filterDecision]);

  const handleRefresh = useCallback(() => {
    fetchProgress();
  }, [fetchProgress]);

  const handleExport = useCallback(
    async (decision: 'keep' | 'pending') => {
      if (!batchId) return;
      setExportDialogOpen(false);
      try {
        const blob = await selection.exportExcel(batchId, decision);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${decision === 'keep' ? '要' : '待定'}_清单_${batchId.slice(0, 8)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('导出成功');
      } catch (error) {
        logger.error('导出失败', error);
        toast.error('导出失败');
      }
    },
    [batchId],
  );

  const handleStatClick = useCallback((key: FilterDecision) => {
    setFilterDecision(key);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilterDecision(null);
  }, []);

  const setCardRef = useCallback((id: string) => {
    return (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(id, el);
      } else {
        cardRefs.current.delete(id);
      }
    };
  }, []);

  const showEmpty =
    !loading && products.length === 0 && filterDecision !== null;

  // 打开商品页链接
  const productShopUrl = useMemo(() => {
    if (!currentProduct?.productId) return '';
    return `https://shop.tiktok.com/view/product/${currentProduct.productId}?source=agency&region=br`;
  }, [currentProduct]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-full overflow-x-hidden">
      {/* 顶部导航栏 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between h-12 px-3 max-w-lg mx-auto w-full">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label="返回首页"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="text-[13px] font-medium text-gray-800 flex-1 text-center px-1 truncate">
            已处理 {processedCount} / 总数 {totalCount}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExportDialogOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
              aria-label="导出清单"
            >
              <Download className="w-5 h-5 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={() => setQrDialogOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
              aria-label="手机扫码一起工作"
            >
              <QrCode className="w-5 h-5 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
              aria-label="刷新"
            >
              <RefreshCw className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        {/* 进度统计条 - 可点击筛选 */}
        <div
          className="flex border-t border-gray-100 max-w-lg mx-auto w-full"
          data-ai-section-type="card-stat"
        >
          {stats.map((stat) => {
            const isActive = filterDecision === stat.key;
            return (
              <button
                key={stat.key}
                type="button"
                onClick={() => handleStatClick(stat.key)}
                className={`flex-1 flex flex-col items-center py-2.5 transition-colors cursor-pointer relative ${
                  isActive ? `${stat.activeBg}` : 'hover:bg-gray-50 active:bg-gray-100'
                }`}
                aria-pressed={isActive}
              >
                <span
                  className={`text-base font-bold ${
                    isActive ? stat.activeText : 'text-gray-800'
                  }`}
                >
                  {stat.value}
                </span>
                <span className="text-[11px] text-gray-500">{stat.label}</span>
                {isActive && (
                  <span
                    className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${stat.barColor}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 筛选模式提示条 */}
        {filterDecision !== null && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 bg-gray-50 max-w-lg mx-auto w-full">
            <span className="text-xs text-gray-600">
              当前筛选：{filterLabel} · 共 {filterCount} 件
            </span>
            <button
              type="button"
              onClick={handleClearFilter}
              className="flex items-center gap-0.5 text-xs text-blue-600 font-medium hover:text-blue-700 active:text-blue-800"
            >
              <X className="w-3 h-3" />
              返回全部
            </button>
          </div>
        )}

        {/* 跳转控制 - 可折叠 */}
        {jumpPanelOpen && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50 max-w-lg mx-auto w-full">
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Input
                  type="number"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  placeholder="页码"
                  className="h-7 text-[11px] px-2"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleJumpPage}
                  className="shrink-0 h-7 text-[11px] px-2"
                >
                  跳转
                </Button>
              </div>
              <div className="text-[10px] text-gray-500 text-center">
                第 {currentPage} / {totalPages} 页
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Input
                  type="number"
                  value={indexInput}
                  onChange={(e) => setIndexInput(e.target.value)}
                  placeholder="序号"
                  className="h-7 text-[11px] px-2"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleJumpIndex}
                  className="shrink-0 h-7 text-[11px] px-2"
                >
                  跳序
                </Button>
              </div>
              <div className="text-[10px] text-gray-500 text-center">
                #{pageStartIdx} - #{pageEndIdx}
              </div>
            </div>
          </div>
        )}

        {/* 展开/收起跳转面板按钮 */}
        <button
          type="button"
          onClick={() => setJumpPanelOpen((v) => !v)}
          className="w-full flex items-center justify-center py-1 text-[10px] text-gray-400 hover:text-gray-600 border-t border-gray-100 max-w-lg mx-auto"
          aria-label={jumpPanelOpen ? '收起跳转' : '展开跳转'}
        >
          {jumpPanelOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* 二维码弹窗 */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手机扫码一起工作</DialogTitle>
            <DialogDescription>
              扫码打开该批次选品页，多台手机同时分工，判定状态实时同步
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <QRCodeSVG
                value={resolveAppUrl(`/selection/${batchId}`)}
                size={200}
              />
            </div>
            <p className="text-xs text-gray-500 break-all text-center max-w-full">
              {resolveAppUrl(`/selection/${batchId}`)}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 导出弹窗 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出清单</DialogTitle>
            <DialogDescription>
              选择要导出的商品判定类型
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <button
              type="button"
              onClick={() => handleExport('keep')}
              className="w-full h-12 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 active:bg-green-700 text-sm"
              data-ai-section-type="button"
            >
              导出"要"清单
            </button>
            <button
              type="button"
              onClick={() => handleExport('pending')}
              className="w-full h-12 bg-amber-400 text-gray-900 font-medium rounded-lg hover:bg-amber-500 active:bg-amber-600 text-sm"
              data-ai-section-type="button"
            >
              导出"待定"清单
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 商品卡片流 */}
      <div className="flex-1 w-full pt-[112px] pb-[150px] px-3 max-w-lg mx-auto">
        {showEmpty ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-500">已全部处理完</p>
            <button
              type="button"
              onClick={handleClearFilter}
              className="mt-3 text-sm text-blue-600 font-medium"
            >
              返回全部列表
            </button>
          </div>
        ) : products.length === 0 && loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="mt-3 text-sm text-gray-500">加载中...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 w-full" data-ai-section-type="card-list">
            {products.map((product, idx) => {
              const isCurrent = currentProductId === product.id;
              const proxySrc = getImageProxyUrl(product.imageUrl);
              const hasError = imageErrors[product.id] !== undefined;
              const imgKey = `${product.id}-${imageErrors[product.id] ?? 0}`;

              return (
                <div
                  key={product.id}
                  ref={setCardRef(product.id)}
                  data-product-id={product.id}
                  className={`bg-white rounded-xl shadow-sm overflow-hidden border w-full max-w-full transition-all ${
                    isCurrent
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-gray-100'
                  }`}
                >
                  {/* 状态标签 + 序号 + 当前标记 */}
                  <div className="relative w-full">
                    <span
                      className={`absolute top-2 left-2 z-10 px-2 py-0.5 text-xs font-medium rounded ${DECISION_BG_CLASS[product.decision]} ${DECISION_TEXT_CLASS[product.decision]}`}
                    >
                      {DECISION_LABEL[product.decision]}
                    </span>
                    {isCurrent && (
                      <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded">
                        当前
                      </span>
                    )}
                    <span className="absolute top-2 right-2 z-10 px-2 py-0.5 text-xs bg-black/50 text-white rounded">
                      #{idx + 1}
                    </span>

                    {/* 商品图片 */}
                    <div className="w-full h-[200px] bg-gray-100 relative overflow-hidden">
                      {proxySrc && !hasError ? (
                        <Image
                          key={imgKey}
                          src={proxySrc}
                          alt={product.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={() => handleImageError(product.id)}
                        />
                      ) : hasError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-200">
                          <span className="text-sm text-gray-500">
                            图片加载失败
                          </span>
                          <button
                            type="button"
                            onClick={() => handleImageRetry(product.id)}
                            className="flex items-center gap-1 px-3 py-1 text-xs text-blue-600 bg-white rounded border border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                            aria-label="重试加载图片"
                          >
                            <RefreshCcw className="w-3 h-3" />
                            重试
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          无图片
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 商品信息 */}
                  <div className="p-3 space-y-0.5">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                      {product.title}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">
                      {product.category || '未知类目'}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {product.shopName || '未知店铺'}
                    </p>
                    <p className="text-lg font-bold text-red-500">
                      {formatPrice(product.priceBrl, product.price)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 加载更多哨兵 */}
        <div ref={sentinelRef} className="h-16 flex items-center justify-center">
          {loading && !showEmpty && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中...
            </div>
          )}
          {!hasMore && products.length > 0 && !loading && (
            <p className="text-sm text-gray-400">没有更多了</p>
          )}
        </div>
      </div>

      {/* 底部固定判定操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0_0_0_0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto w-full">
          {/* 当前商品信息 */}
          <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2 border-b border-gray-100">
            <span className="text-xs text-gray-700 truncate flex-1">
              {currentProduct?.title ?? '请滚动到商品'}
            </span>
            <span className="text-sm font-bold text-red-500 shrink-0">
              {currentProduct
                ? formatPrice(currentProduct.priceBrl, currentProduct.price)
                : '--'}
            </span>
          </div>

          {/* 打开商品页按钮 */}
          <div className="px-3 pt-2">
            {currentProduct ? (
              <UniversalLink
                to={productShopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-10 bg-blue-500 text-white text-center leading-[40px] font-medium rounded-lg hover:bg-blue-600 active:bg-blue-700 text-sm"
              >
                打开商品页
              </UniversalLink>
            ) : (
              <div className="w-full h-10 bg-gray-200 text-gray-400 text-center leading-[40px] rounded-lg text-sm">
                打开商品页
              </div>
            )}
          </div>

          {/* 三个判定按钮 */}
          <div className="flex gap-2 p-3">
            <button
              type="button"
              onClick={() =>
                currentProductId && handleDecision(currentProductId, 'keep')
              }
              disabled={!currentProductId}
              className="flex-1 h-11 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 active:bg-green-700 text-base disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-ai-section-type="button"
            >
              要
            </button>
            <button
              type="button"
              onClick={() =>
                currentProductId && handleDecision(currentProductId, 'discard')
              }
              disabled={!currentProductId}
              className="flex-1 h-11 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 active:bg-red-700 text-base disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-ai-section-type="button"
            >
              弃
            </button>
            <button
              type="button"
              onClick={() =>
                currentProductId && handleDecision(currentProductId, 'pending')
              }
              disabled={!currentProductId}
              className="flex-1 h-11 bg-amber-400 text-gray-900 font-medium rounded-lg hover:bg-amber-500 active:bg-amber-600 text-base disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-ai-section-type="button"
            >
              待定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionPage;
