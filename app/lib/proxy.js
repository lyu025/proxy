import { validateUrl } from './utils';
import { logger } from './logger';

export async function handleProxyRequest(request) {
	const startTime = Date.now();
	const requestId = generateRequestId();
	
	try {
		const url = new URL(request.url);
		let targetUrl = url.searchParams.get('url');
		
		// 支持 /p/encoded-url 短路径格式
		if (!targetUrl && url.pathname.startsWith('/p/')) {
			const encodedPath = url.pathname.substring(3); // 移除 '/p/'
			targetUrl = decodeURIComponent(encodedPath);
		}
		
		logger.info('开始处理代理请求', {
			requestId,
			targetUrl,
			path: url.pathname,
			method: 'short-path'
		});
		
		if (!targetUrl) {
			logger.warn('缺少 URL 参数', { requestId });
			return createErrorResponse('缺少 URL 参数', 400, requestId);
		}
		
		// 验证 URL
		const validUrl = validateUrl(targetUrl);
		if (!validUrl) {
			logger.warn('无效的 URL 格式', { requestId, targetUrl });
			return createErrorResponse('无效的 URL 格式', 400, requestId);
		}
		
		console.log('代理请求:', validUrl);
		
		// 设置请求超时
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);
		
		try {
			// 发起代理请求
			const response = await fetch(validUrl, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Accept': '*/*',
					'Referer': getBaseUrl(validUrl) || validUrl,
					'Origin': getBaseUrl(validUrl) || validUrl
				},
				redirect: 'follow'
			});
			
			clearTimeout(timeoutId);
			
			if (!response.ok) {
				logger.warn('目标服务器错误', {
					requestId,
					status: response.status,
					url: validUrl
				});
				return createErrorResponse(`目标服务器错误: ${response.status}`, response.status, requestId);
			}
			
			// 构建响应头
			const headers = new Headers();
			const contentType = response.headers.get('content-type') || 'application/octet-stream';
			const contentLength = response.headers.get('content-length');
			
			headers.set('Content-Type', contentType);
			headers.set('Cache-Control', 'public, max-age=31536000');
			headers.set('Access-Control-Allow-Origin', '*');
			headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
			headers.set('Access-Control-Expose-Headers', '*');
			headers.set('X-Request-ID', requestId);
			
			if (contentLength) {
				headers.set('Content-Length', contentLength);
			}
			
			// 复制其他有用的头
			const headersToCopy = [
				'content-disposition',
				'content-range',
				'accept-ranges',
				'etag',
				'last-modified',
				'expires'
			];
			
			headersToCopy.forEach(header => {
				const value = response.headers.get(header);
				if (value) {
					headers.set(header, value);
				}
			});
			
			const totalDuration = Date.now() - startTime;
			logger.info('代理请求完成', {
				requestId,
				status: response.status,
				totalDuration: `${totalDuration}ms`,
				url: validUrl,
				contentType
			});
			
			// 返回代理的响应
			return new Response(response.body, {
				status: response.status,
				headers: headers
			});
			
		} catch (fetchError) {
			clearTimeout(timeoutId);
			
			if (fetchError.name === 'AbortError') {
				logger.warn('代理请求超时', { requestId, url: validUrl });
				return createErrorResponse('请求超时', 504, requestId);
			}
			
			throw fetchError;
		}
		
	} catch (error) {
		const totalDuration = Date.now() - startTime;
		logger.error('代理处理异常', {
			requestId,
			error: error.message,
			stack: error.stack,
			totalDuration: `${totalDuration}ms`
		});
		
		return createErrorResponse(`代理失败: ${error.message}`, 500, requestId);
	}
}

// 辅助函数
function getBaseUrl(urlString) {
	try {
		const url = new URL(urlString);
		return `${url.protocol}//${url.hostname}`;
	} catch {
		return null;
	}
}

function generateRequestId() {
	return `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function createErrorResponse(message, status, requestId) {
	return new Response(
		JSON.stringify({
			error: message,
			requestId,
			timestamp: new Date().toISOString()
		}),
		{
			status,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'X-Request-ID': requestId
			}
		}
	);
}