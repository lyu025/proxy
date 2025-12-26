/**
 * 增强的日志记录工具
 */
class Logger {
	constructor(level = 'info') {
		this.level = level;
		this.levels = {
			error: 0,
			warn: 1,
			info: 2,
			debug: 3
		};
	}

	log(level, message, data = {}) {
		if (this.levels[level] <= this.levels[this.level]) {
			const logEntry = {
				timestamp: new Date().toISOString(),
				level: level.toUpperCase(),
				message,
				data,
				// 在 Vercel 环境中添加额外信息
				...(process.env.VERCEL && {
					vercel: {
						region: process.env.VERCEL_REGION,
						environment: process.env.VERCEL_ENV,
						deploymentId: process.env.VERCEL_GIT_COMMIT_SHA
					}
				})
			};

			// 不同环境使用不同格式
			if (process.env.NODE_ENV === 'development') {
				console.log(this.formatConsole(level, message, data));
			} else {
				// 生产环境使用 JSON 格式，方便 Vercel 解析
				console.log(JSON.stringify(logEntry));
			}
		}
	}

	formatConsole(level, message, data) {
		const colors = {
			error: '\x1b[31m', // 红色
			warn: '\x1b[33m',	// 黄色
			info: '\x1b[36m',	// 青色
			debug: '\x1b[90m'	// 灰色
		};
		const reset = '\x1b[0m';
		
		const time = new Date().toLocaleTimeString();
		const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;
		
		let output = `${time} ${prefix} ${message}`;
		
		if (Object.keys(data).length > 0) {
			output += `\n${JSON.stringify(data, null, 2)}`;
		}
		
		return output;
	}

	error(message, data = {}) {
		this.log('error', message, data);
	}

	warn(message, data = {}) {
		this.log('warn', message, data);
	}

	info(message, data = {}) {
		this.log('info', message, data);
	}

	debug(message, data = {}) {
		this.log('debug', message, data);
	}

	// 记录 HTTP 请求
	request(req, data = {}) {
		this.info(`${req.method} ${req.url}`, {
			ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
			userAgent: req.headers.get('user-agent'),
			referer: req.headers.get('referer'),
			...data
		});
	}

	// 记录 M3U8 处理
	m3u8(url, segmentCount, data = {}) {
		this.info(`M3U8 处理: ${url}`, {
			segments: segmentCount,
			url,
			...data
		});
	}

	// 记录代理请求
	proxy(sourceUrl, status, data = {}) {
		this.info(`代理: ${sourceUrl} → ${status}`, {
			sourceUrl,
			status,
			...data
		});
	}
}

// 创建全局 logger 实例
export const logger = new Logger(
	process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info')
);

export default logger;