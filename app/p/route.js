import { NextRequest, NextResponse } from 'next/server';
import fetch, { Headers as FetchHeaders } from 'node-fetch';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	return handleProxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
	return handleProxyRequest(request, 'POST');
}

export async function OPTIONS() {
	// 处理预检请求
	return new NextResponse(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': '*',
			'Access-Control-Max-Age': '86400'
		}
	});
}

// 通用的代理处理函数
async function handleProxyRequest(request: NextRequest, method: string) {
	const searchParams = request.nextUrl.searchParams;
	const targetUrl = searchParams.get('url');

	// 检查目标URL
	if (!targetUrl) {
		return NextResponse.json(
			{ error: '缺少目标URL参数', usage: '/p?url=目标URL' },
			{ status: 400 }
		);
	}

	try {
		// 获取请求数据
		let requestBody: string | Buffer | undefined;
		const contentType = request.headers.get('content-type');
		
		if (method === 'POST') {
			if (contentType?.includes('application/json')) {
				requestBody = JSON.stringify(await request.json());
			} else if (contentType?.includes('form')) {
				requestBody = await request.text();
			} else {
				requestBody = await request.text();
			}
		}

		// 创建请求头
		const headers = new FetchHeaders();
		request.headers.forEach((value, key) => {
			if (!['host', 'content-length', 'origin'].includes(key.toLowerCase())) {
				headers.set(key, value);
			}
		});

		// 构建请求URL（包含查询参数）
		const urlObj = new URL(targetUrl);
		searchParams.forEach((value, key) => {
			if (key !== 'url') {
				urlObj.searchParams.append(key, value);
			}
		});

		// 发起跨域请求
		const fetchOptions: any = {
			method,
			headers,
			redirect: 'follow'
		};

		if (method === 'POST' && requestBody) {
			fetchOptions.body = requestBody;
		}

		const response = await fetch(urlObj.toString(), fetchOptions);

		// 处理响应
		const contentTypeHeader = response.headers.get('content-type') || '';
		let responseBody = await response.text();

		// 处理m3u8文件
		if (isM3U8Content(targetUrl, contentTypeHeader)) {
			responseBody = processM3U8(responseBody, targetUrl, request.nextUrl.origin);
		}

		// 构建响应头
		const responseHeaders = new Headers();
		response.headers.forEach((value, key) => {
			if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
				responseHeaders.set(key, value);
			}
		});

		// 添加CORS头
		responseHeaders.set('Access-Control-Allow-Origin', '*');
		responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		responseHeaders.set('Access-Control-Allow-Headers', '*');

		return new NextResponse(responseBody, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});

	} catch (error) {
		console.error('代理请求失败:', error);
		return NextResponse.json(
			{ 
				error: '代理请求失败', 
				details: error instanceof Error ? error.message : '未知错误',
				targetUrl 
			},
			{ status: 500 }
		);
	}
}

// 检查是否为M3U8内容
function isM3U8Content(url: string, contentType: string): boolean {
	const m3u8ContentTypes = [
		'application/vnd.apple.mpegurl',
		'application/x-mpegurl',
		'audio/mpegurl',
		'audio/x-mpegurl'
	];
	
	return m3u8ContentTypes.some(type => contentType.includes(type)) ||
				 url.toLowerCase().endsWith('.m3u8');
}

// 处理M3U8文件内容
function processM3U8(content: string, originalUrl: string, proxyOrigin: string): string {
	const baseUrl = new URL(originalUrl);
	const proxyBase = `${proxyOrigin}/p?url=`;
	
	return content.split('\n').map(line => {
		// 跳过注释、空行和特殊指令
		if (line.startsWith('#') || !line.trim()) return line;
		
		// 处理URL行
		try {
			// 尝试解析为完整URL
			const lineUrl = new URL(line, baseUrl.origin);
			return `${proxyBase}${encodeURIComponent(lineUrl.toString())}`;
		} catch {
			// 处理相对路径
			if (line.startsWith('/')) {
				// 绝对路径
				return `${proxyBase}${encodeURIComponent(baseUrl.origin + line)}`;
			} else if (!line.includes('://')) {
				// 相对路径
				const parentUrl = baseUrl.href.substring(0, baseUrl.href.lastIndexOf('/') + 1);
				const fullUrl = new URL(line, parentUrl);
				return `${proxyBase}${encodeURIComponent(fullUrl.toString())}`;
			}
			return line;
		}
	}).join('\n');
}