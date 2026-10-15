export type DecisionType = 'untouched' | 'keep' | 'discard' | 'pending';

export interface BatchInfo {
  id: string;
  fileName: string;
  totalCount: number;
  pendingCount: number;
  status: string;
  createdAt: string;
  keepCount?: number;
  discardCount?: number;
  pendingDecisionCount?: number;
  untouchedCount?: number;
}

export interface ProductInfo {
  id: string;
  batchId: string;
  productId: string;
  title: string;
  region: string | null;
  productUrl: string;
  shopUrl: string;
  imageUrl: string | null;
  category: string | null;
  shopName: string | null;
  shopType: string | null;
  operationMode: string | null;
  shopSales: number | null;
  price: string | null;
  priceBrl: string | null;
  firstThreeDaysSales: number | null;
  recentThreeDaysSales: number | null;
  totalSales: number | null;
  firstThreeDaysRevenue: string | null;
  firstThreeDaysRevenueBrl: string | null;
  recentThreeDaysRevenue: string | null;
  recentThreeDaysRevenueBrl: string | null;
  totalRevenue: string | null;
  totalRevenueBrl: string | null;
  influencerCount: number | null;
  decision: DecisionType;
  sortIndex: number;
}

export interface BatchListResponse {
  items: BatchInfo[];
}

export interface ProductListResponse {
  items: ProductInfo[];
  total: number;
  page: number;
  pageSize: number;
  filterDecision?: DecisionType | null;
}

export interface BatchProgressResponse {
  total: number;
  keep: number;
  discard: number;
  pending: number;
  untouched: number;
  processed: number;
}

export interface UploadResponse {
  batchId: string;
  fileName: string;
  totalCount: number;
  filteredCount: number;
}

export interface DecisionRequest {
  decision: DecisionType;
}

export interface DeleteBatchResponse {
  success: boolean;
  deletedBatchId: string;
}
