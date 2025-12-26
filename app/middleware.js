import { NextResponse } from 'next/server';
import { handleM3U8Request } from '@/lib/m3u8';
import { handleProxyRequest } from '@/lib/proxy';
import { logger } from '@/lib/logger';

// 配置中间件匹配路径 - 使用短路径
export const config = {
	matcher: [
		'/m/:path*',			// 短路径 M3U8 处理
		'/p/:path*',			// 短路径代理
		'/m3u8/:path*',	 // 兼容旧路径
		'/proxy/:path*',	// 兼容旧路径
		'/api/:path*'		 // API 路由
	]
};

// 主中间件函数
export async function middleware(request) {
	const startTime = Date.now();
	const requestId = generateRequestId();
	const url = new URL(request.url);
	
	// 记录请求开始
	logger.request(request, {
		requestId,
		middleware: true,
		path: url.pathname
	});

	try {
		let response;
		
		// 短路径路由处理
		if (url.pathname.startsWith('/m/') || url.pathname.startsWith('/m3u8')) {
			logger.info('路由到 M3U8 处理器', { requestId, path: url.pathname });
			response = await handleM3U8Request(request);
		} else if (url.pathname.startsWith('/p/') || url.pathname.startsWith('/proxy')) {
			logger.info('路由到代理处理器', { requestId, path: url.pathname });
			response = await handleProxyRequest(request);
		} else {
			logger.debug('未匹配路由，继续下一个中间件', { requestId });
			return NextResponse.next();
		}
		
		// 记录响应信息
		const duration = Date.now() - startTime;
		logger.info('请求完成', {
			requestId,
			status: response.status,
			duration: `${duration}ms`,
			path: url.pathname
		});
		
		return response;
		
	} catch (error) {
		// 记录错误
		const duration = Date.now() - startTime;
		logger.error('中间件处理失败', {
			requestId,
			error: error.message,
			stack: error.stack,
			duration: `${duration}ms`,
			path: url.pathname
		});
		
		return new Response(
			JSON.stringify({
				error: '内部服务器错误',
				requestId,
				timestamp: new Date().toISOString()
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			}
		);
	}
}

// 生成请求 ID
function generateRequestId() {
	return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 处理 OPTIONS 请求
export async function OPTIONS(request) {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Max-Age': '86400'
		}
	});
}