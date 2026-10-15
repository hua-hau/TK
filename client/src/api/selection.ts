import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type {
  BatchListResponse,
  BatchProgressResponse,
  DecisionRequest,
  DecisionType,
  DeleteBatchResponse,
  ProductListResponse,
  UploadResponse,
} from '@shared/api.interface';

export async function getBatches(): Promise<BatchListResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/selection/batches',
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取批次列表失败', error);
    throw error;
  }
}

export async function uploadBatch(file: File): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axiosForBackend.post(
      '/api/selection/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  } catch (error) {
    logger.error('上传解析失败', error);
    throw error;
  }
}

export async function getBatchProgress(batchId: string): Promise<BatchProgressResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/selection/batches/${batchId}/progress`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取进度失败', error);
    throw error;
  }
}

export async function getProducts(
  batchId: string,
  page: number,
  pageSize: number,
  decision?: DecisionType,
): Promise<ProductListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (decision) params.set('decision', decision);
    const response = await axiosForBackend({
      url: `/api/selection/batches/${batchId}/products?${params.toString()}`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取商品列表失败', error);
    throw error;
  }
}

export async function setProductDecision(
  productId: string,
  decision: DecisionRequest['decision'],
): Promise<{ decision: DecisionRequest['decision'] }> {
  try {
    const response = await axiosForBackend.patch(
      `/api/selection/products/${productId}/decision`,
      { decision },
    );
    return response.data;
  } catch (error) {
    logger.error('设置判定失败', error);
    throw error;
  }
}

export async function deleteBatch(
  batchId: string,
): Promise<DeleteBatchResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/selection/batches/${batchId}`,
      method: 'DELETE',
    });
    return response.data;
  } catch (error) {
    logger.error('删除批次失败', error);
    throw error;
  }
}

export async function exportExcel(
  batchId: string,
  decision: 'keep' | 'pending',
): Promise<Blob> {
  try {
    const response = await axiosForBackend.get(
      `/api/selection/batches/${batchId}/export?decision=${decision}`,
      { responseType: 'blob' },
    );
    return response.data;
  } catch (error) {
    logger.error('导出失败', error);
    throw error;
  }
}
