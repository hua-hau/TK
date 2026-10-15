import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { SelectionModule } from './modules/selection/selection.module';

// CSRF 保护的路由（显式列出，排除图片代理接口——<img> 标签无法携带 CSRF header）
// 图片代理 GET /api/selection/image-proxy 不在此列表，跳过 CSRF 校验
const CSRF_ROUTES = [
  '/api/selection/upload',
  '/api/selection/batches',
  '/api/selection/batches/*/progress',
  '/api/selection/batches/*/products',
  '/api/selection/batches/*/export',
  '/api/selection/batches/*',
  '/api/selection/products/*/decision',
];

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot({
      csrfRoutes: CSRF_ROUTES,
    }),
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    SelectionModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
