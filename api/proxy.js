const https = require('https')
const http = require('http')
const{URL}=require('url')

const mimeMap = {
	'.m3u8': 'application/vnd.apple.mpegurl',
	'.ts': 'video/MP2T',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.m4s': 'video/iso.segment',
	'.m4a': 'audio/mp4',
	'.mp3': 'audio/mpeg',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.html': 'text/html',
	'.json': 'application/json'
}

const getClient = u => u.startsWith('https') ? https : http

module.exports = async (req, res) => {
	// 设置CORS头
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
	
	if (req.method === 'OPTIONS') {
		res.status(204).end()
		return
	}
	
	const targetUrl = req.query.url || req.url.replace(/^\/\?url=/, '')
	if (!targetUrl) {
		res.status(400).json({ error: 'Missing url parameter' })
		return
	}
	
	try {
		const decodedUrl = decodeURIComponent(targetUrl)
		const urlObj = new URL(decodedUrl)
		const pathname = urlObj.pathname.toLowerCase()
		const isM3U8 = pathname.endsWith('.m3u8')
		const ext = pathname.match(/\.[a-z0-9]+$/)?.[0] || ''
		const mime = mimeMap[ext] || 'application/octet-stream'
		
		// 构建Vercel环境中的代理前缀
		const proxyPrefix = `/proxy?url=`
		
		const options = {
			method: req.method,
			headers: {
				...req.headers,
				host: urlObj.host,
				origin: undefined,
				referer: undefined,
				'x-forwarded-for': undefined,
				'x-forwarded-proto': undefined
			}
		}
		
		delete options.headers['content-length']
		
		const proxyReq = getClient(decodedUrl).request(decodedUrl, options, proxyRes => {
			// 复制响应头但过滤CORS相关头
			const headers = { ...proxyRes.headers }
			delete headers['access-control-allow-origin']
			delete headers['access-control-allow-methods']
			delete headers['access-control-allow-headers']
			
			// 设置Content-Type
			headers['content-type'] = mime
			
			// 设置视频相关头
			if (['.m3u8', '.ts', '.mp4', '.webm', '.m4s'].includes(ext)) {
				headers['accept-ranges'] = ['.ts', '.m4s'].includes(ext) ? 'none' : 'bytes'
				headers['cache-control'] = 'public, max-age=3600'
			} else {
				headers['cache-control'] = 'no-cache'
			}
			
			// 设置响应头
			Object.keys(headers).forEach(key => {
				if (headers[key]) res.setHeader(key, headers[key])
			})
			
			if (isM3U8) {
				let data = Buffer.from('')
				proxyRes.on('data', chunk => {
					data = Buffer.concat([data, Buffer.from(chunk)])
				})
				proxyRes.on('end', () => {
					const base = `${urlObj.protocol}//${urlObj.host}${pathname.substring(0, pathname.lastIndexOf('/') + 1)}`
					const lines = data.toString().split('\n')
					const processed = lines.map(line => {
						const trimmed = line.trim()
						if (!trimmed || trimmed.startsWith('#') || trimmed.includes('://')) return line
						
						let fullUrl
						if (trimmed.startsWith('/')) {
							fullUrl = `${urlObj.protocol}//${urlObj.host}${trimmed}`
						} else {
							fullUrl = `${base}${trimmed}`
						}
						
						return `${proxyPrefix}${encodeURIComponent(fullUrl)}`
					}).join('\n')
					
					res.setHeader('cache-control', 'no-cache')
					res.status(proxyRes.statusCode).send(processed)
				})
			} else {
				res.status(proxyRes.statusCode)
				proxyRes.pipe(res)
			}
		})
		
		proxyReq.on('error', (err) => {
			console.error('Proxy error:', err.message)
			res.status(500).json({ error: 'Proxy error', message: err.message })
		})
		
		// 处理请求体
		if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
			if (req.body) {
				const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
				proxyReq.write(bodyStr)
			} else {
				req.on('data', chunk => proxyReq.write(chunk))
			}
		}
		
		req.on('end', () => proxyReq.end())
		
	} catch (err) {
		console.error('Error:', err.message)
		res.status(500).json({ error: 'Invalid request', message: err.message })
	}
}