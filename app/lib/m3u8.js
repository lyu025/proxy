import { logger } from './logger';
import { validateUrl, getBaseUrl, buildProxyUrl } from './utils';

export async function handleM3U8Request(request) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  try {
    const url = new URL(request.url);
    let targetUrl = url.searchParams.get('url');
    
    // 支持 /m/encoded-url 格式
    if (!targetUrl && url.pathname.startsWith('/m/')) {
      const encodedPath = url.pathname.substring(3); // 移除 '/m/'
      targetUrl = decodeURIComponent(encodedPath);
    }
    
    logger.info('开始处理 M3U8 请求', {
      requestId,
      targetUrl,
      path: url.pathname,
      method: 'short-path'
    });
    
    if (!targetUrl) {
      logger.warn('缺少 URL 参数', { requestId });
      return createErrorResponse('缺少 URL 参数', 400, requestId);
    }
    
    const validUrl = validateUrl(targetUrl);
    if (!validUrl) {
      logger.warn('无效的 URL 格式', { requestId, targetUrl });
      return createErrorResponse('无效的 URL 格式', 400, requestId);
    }
    
    logger.debug('验证后的 URL', { requestId, validUrl });
    
    // 获取内容
    const fetchStart = Date.now();
    const response = await fetch(validUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/vnd.apple.mpegurl, */*'
      }
    });
    const fetchDuration = Date.now() - fetchStart;
    
    logger.debug('获取内容完成', {
      requestId,
      status: response.status,
      fetchDuration: `${fetchDuration}ms`
    });
    
    if (!response.ok) {
      logger.warn('获取内容失败', {
        requestId,
        status: response.status,
        url: validUrl
      });
      return createErrorResponse(`获取失败: ${response.status}`, response.status, requestId);
    }
    
    const content = await response.text();
    const contentType = response.headers.get('content-type') || '';
    
    logger.debug('内容信息', {
      requestId,
      contentType,
      contentLength: content.length
    });
    
    if (!content.includes('#EXTM3U')) {
      logger.warn('不是有效的 M3U8 文件', {
        requestId,
        contentType,
        preview: content.substring(0, 200)
      });
      return createErrorResponse('不是有效的 M3U8 文件', 400, requestId);
    }
    
    // 获取代理基础 URL
    const baseUrl = getBaseUrl(validUrl) || validUrl;
    const proxyBaseUrl = url.origin;
    
    // 使用短路径处理内容
    const processedContent = processM3U8(content, baseUrl, proxyBaseUrl, true);
    
    // 统计信息
    const lines = content.split('\n');
    const segmentCount = lines.filter(line => 
      line.trim() && !line.trim().startsWith('#')
    ).length;
    
    const totalDuration = Date.now() - startTime;
    
    logger.info('M3U8 处理完成', {
      requestId,
      originalSegments: segmentCount,
      processedSegments: processedContent.split('\n').filter(l => 
        l.includes('/p?url=') || l.includes('/p/')
      ).length,
      totalDuration: `${totalDuration}ms`,
      source: validUrl,
      method: 'short-path'
    });
    
    return new Response(processedContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
        'X-Request-ID': requestId,
        'X-Processed-Time': `${totalDuration}ms`
      }
    });
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error('M3U8 处理异常', {
      requestId,
      error: error.message,
      stack: error.stack,
      totalDuration: `${totalDuration}ms`
    });
    
    return createErrorResponse(`处理失败: ${error.message}`, 500, requestId);
  }
}

/**
 * 处理 M3U8 内容，支持短路径
 */
function processM3U8(content, baseUrl, proxyBaseUrl, useShortPath = true) {
  const lines = content.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // 空行保留
    if (line === '') {
      result.push('');
      continue;
    }
    
    // 注释行保留
    if (trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }
    
    // 处理资源行
    if (trimmed) {
      let resourceUrl = trimmed;
      
      // 协议相对 URL
      if (trimmed.startsWith('//')) {
        resourceUrl = `https:${trimmed}`;
      }
      // 相对路径
      else if (!trimmed.startsWith('http')) {
        try {
          resourceUrl = new URL(trimmed, baseUrl).toString();
        } catch {
          const separator = baseUrl.endsWith('/') || trimmed.startsWith('/') ? '' : '/';
          resourceUrl = `${baseUrl}${separator}${trimmed}`;
        }
      }
      
      // 构建代理 URL - 使用短路径
      let proxyUrl;
      if (useShortPath) {
        // 两种短路径格式都支持
        const encodedUrl = encodeURIComponent(resourceUrl);
        // 使用 /p/encoded-url 格式，更简洁
        proxyUrl = `${proxyBaseUrl}/p/${encodedUrl}`;
      } else {
        proxyUrl = buildProxyUrl(resourceUrl, proxyBaseUrl);
      }
      
      result.push(proxyUrl);
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

// 辅助函数
function generateRequestId() {
  return `m3u8_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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