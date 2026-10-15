import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import {
  Upload,
  FileSpreadsheet,
  Clock,
  Package,
  Loader2,
  Trash2,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';

import { selection } from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Card } from '@client/src/components/ui/card';
import { Progress } from '@client/src/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import type { BatchInfo } from '@shared/api.interface';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const HomePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await selection.getBatches();
      setBatches(res.items);
    } catch (error) {
      logger.error('加载批次列表失败', error);
      toast.error('加载批次列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.xlsx')) {
        toast.error('请上传 .xlsx 格式的 Excel 文件');
        return;
      }
      setUploading(true);
      try {
        const res = await selection.uploadBatch(file);
        toast.success(`上传成功，共 ${res.totalCount} 个商品`);
        void loadBatches();
        navigate(`/selection/${res.batchId}`);
      } catch (error) {
        logger.error('上传失败', error);
        toast.error('上传失败，请重试');
      } finally {
        setUploading(false);
      }
    },
    [loadBatches, navigate],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const getProgress = (batch: BatchInfo): number => {
    if (batch.totalCount === 0) return 0;
    const processed =
      (batch.keepCount ?? 0) +
      (batch.discardCount ?? 0) +
      (batch.pendingDecisionCount ?? 0);
    return Math.round((processed / batch.totalCount) * 100);
  };

  const getProcessed = (batch: BatchInfo): number =>
    (batch.keepCount ?? 0) +
    (batch.discardCount ?? 0) +
    (batch.pendingDecisionCount ?? 0);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteBatchId) return;
    setDeleting(true);
    try {
      await selection.deleteBatch(deleteBatchId);
      toast.success('删除成功');
      setDeleteBatchId(null);
      void loadBatches();
    } catch (error) {
      logger.error('删除批次失败', error);
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  }, [deleteBatchId, loadBatches]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* 标题区 */}
        <header className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            TikTok 巴西站选品
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            多手机协同选品，数据实时同步
          </p>
        </header>

        {/* 上传区域 */}
        <Card
          className={`mb-8 cursor-pointer p-8 text-center transition-all hover:shadow-md ${
            dragOver ? 'border-primary bg-primary/5' : ''
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-ai-section-type="card-list"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          aria-label="上传 Excel 文件"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-base font-medium text-foreground">
                正在上传解析中...
              </p>
              <p className="text-sm text-muted-foreground">
                请稍候，文件较大时可能需要一些时间
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  点击或拖拽上传 Excel 文件
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  仅支持 .xlsx 格式
                </p>
              </div>
              <Button size="lg" className="mt-2" disabled={uploading}>
                <FileSpreadsheet className="h-4 w-4" />
                选择文件
              </Button>
            </div>
          )}
        </Card>

        {/* 批次列表 */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            历史批次
          </h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : batches.length === 0 ? (
            <Card className="p-10 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">暂无批次，上传 Excel 开始选品</p>
            </Card>
          ) : (
            <div className="space-y-3" data-ai-section-type="card-list">
              {batches.map((batch) => {
                const progress = getProgress(batch);
                const processed = getProcessed(batch);
                return (
                  <Card
                    key={batch.id}
                    className="cursor-pointer p-4 transition-all hover:shadow-md active-elevate"
                    onClick={() => navigate(`/selection/${batch.id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/selection/${batch.id}`);
                    }}
                    aria-label={`打开批次 ${batch.fileName}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                       <div className="min-w-0 flex-1">
                         <h3 className="truncate text-base font-semibold text-foreground">
                           {batch.fileName}
                         </h3>
                         <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                           <Clock className="h-3 w-3" />
                           <span>
                             {dayjs(batch.createdAt).fromNow()}
                           </span>
                           <span className="mx-1">·</span>
                           <Package className="h-3 w-3" />
                           <span>{batch.totalCount} 个商品</span>
                         </div>
                       </div>
                       <Button
                         variant="ghost"
                         size="sm"
                         className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                         onClick={(e) => {
                           e.stopPropagation();
                           setDeleteBatchId(batch.id);
                         }}
                         aria-label={`删除批次 ${batch.fileName}`}
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                         删除
                       </Button>
                     </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          已处理 {processed} / {batch.totalCount}
                        </span>
                        <span className="font-medium text-primary">
                          {progress}%
                        </span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        要 {batch.keepCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        弃 {batch.discardCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        待定 {batch.pendingDecisionCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        未处理 {batch.untouchedCount ?? 0}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* 删除确认对话框 */}
        <Dialog
          open={deleteBatchId !== null}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteBatchId(null);
          }}
        >
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>确认删除批次</DialogTitle>
              <DialogDescription>
                删除后该批次的商品和所有判定记录都会消失，确认删除吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setDeleteBatchId(null)}
                disabled={deleting}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default HomePage;
