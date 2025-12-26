'use client';

import { useState } from 'react';

export default function Home() {
	const [url, setUrl] = useState('');
	const [method, setMethod] = useState('GET');
	const [body, setBody] = useState('{"example": "data"}');
	const [response, setResponse] = useState('');
	const [loading, setLoading] = useState(false);
	const [proxyPath, setProxyPath] = useState('/p');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setResponse('');

		try {
			const proxyUrl = `${proxyPath}?url=${encodeURIComponent(url)}`;
			const options: RequestInit = {
				method,
				headers: { 'Content-Type': 'application/json' },
			};

			if (method === 'POST' && body) {
				options.body = body;
			}

			const startTime = Date.now();
			const res = await fetch(proxyUrl, options);
			const endTime = Date.now();
			
			const text = await res.text();
			
			setResponse(`状态码: ${res.status}
响应时间: ${endTime - startTime}ms
内容类型: ${res.headers.get('content-type') || '未知'}

${text.length > 1000 ? text.substring(0, 1000) + '...' : text}`);
		} catch (error) {
			setResponse(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
		} finally {
			setLoading(false);
		}
	};

	const handleTestM3U8 = () => {
		// 示例m3u8链接
		setUrl('https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
		setMethod('GET');
	};

	const handleTestJSON = () => {
		setUrl('https://jsonplaceholder.typicode.com/posts/1');
		setMethod('GET');
	};

	const copyExample = () => {
		const exampleUrl = `${window.location.origin}/p?url=https://example.com/video.m3u8`;
		navigator.clipboard.writeText(exampleUrl);
		alert('示例URL已复制到剪贴板');
	};

	return (
		<div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui' }}>
			<h1 style={{ color: '#0070f3' }}>简洁代理服务</h1>
			<p style={{ color: '#666' }}>使用 <code>/p</code> 路径作为代理端点</p>
			
			<div style={{ 
				background: '#f0f8ff', 
				padding: '15px', 
				borderRadius: '8px',
				marginBottom: '20px',
				borderLeft: '4px solid #0070f3'
			}}>
				<strong>快速开始：</strong>
				<p>
					<code>{window.location.origin}/p?url=目标URL</code>
					<button 
						onClick={copyExample}
						style={{ 
							marginLeft: '10px', 
							padding: '2px 8px',
							background: '#0070f3',
							color: 'white',
							border: 'none',
							borderRadius: '4px',
							fontSize: '12px'
						}}
					>
						复制示例
					</button>
				</p>
			</div>
			
			<form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
				<div style={{ 
					display: 'grid', 
					gridTemplateColumns: '1fr 1fr',
					gap: '20px',
					marginBottom: '15px'
				}}>
					<div>
						<label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>请求方法：</label>
						<select 
							value={method} 
							onChange={(e) => setMethod(e.target.value)}
							style={{ 
								width: '100%', 
								padding: '10px',
								borderRadius: '6px',
								border: '1px solid #ddd'
							}}
						>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
						</select>
					</div>
					
					<div>
						<label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>代理路径：</label>
						<input
							type="text"
							value={proxyPath}
							onChange={(e) => setProxyPath(e.target.value)}
							style={{ 
								width: '100%', 
								padding: '10px',
								borderRadius: '6px',
								border: '1px solid #ddd',
								background: '#f5f5f5'
							}}
							readOnly
						/>
					</div>
				</div>

				<div style={{ marginBottom: '15px' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
						<label style={{ fontWeight: '500' }}>目标URL：</label>
						<div style={{ display: 'flex', gap: '10px' }}>
							<button 
								type="button"
								onClick={handleTestM3U8}
								style={{ 
									padding: '5px 10px', 
									fontSize: '12px',
									background: '#10b981',
									color: 'white', 
									border: 'none', 
									borderRadius: '4px' 
								}}
							>
								测试M3U8
							</button>
							<button 
								type="button"
								onClick={handleTestJSON}
								style={{ 
									padding: '5px 10px', 
									fontSize: '12px',
									background: '#8b5cf6',
									color: 'white', 
									border: 'none', 
									borderRadius: '4px' 
								}}
							>
								测试JSON
							</button>
						</div>
					</div>
					<input
						type="text"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="输入完整的URL地址，如：https://example.com/video.m3u8"
						style={{ 
							width: '100%', 
							padding: '10px',
							borderRadius: '6px',
							border: '1px solid #ddd'
						}}
						required
					/>
				</div>

				{method === 'POST' && (
					<div style={{ marginBottom: '15px' }}>
						<label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>请求体（JSON）：</label>
						<textarea
							value={body}
							onChange={(e) => setBody(e.target.value)}
							rows={4}
							style={{ 
								width: '100%', 
								padding: '10px', 
								fontFamily: 'monospace', 
								borderRadius: '6px',
								border: '1px solid #ddd',
								resize: 'vertical'
							}}
						/>
					</div>
				)}

				<button 
					type="submit" 
					disabled={loading}
					style={{ 
						width: '100%',
						padding: '12px', 
						background: loading ? '#999' : '#0070f3', 
						color: 'white', 
						border: 'none', 
						borderRadius: '6px',
						fontSize: '16px',
						cursor: loading ? 'not-allowed' : 'pointer'
					}}
				>
					{loading ? '请求中...' : '发送代理请求'}
				</button>
			</form>

			{response && (
				<div style={{ 
					marginTop: '20px',
					border: '1px solid #e5e7eb',
					borderRadius: '8px',
					overflow: 'hidden'
				}}>
					<div style={{ 
						background: '#f9fafb', 
						padding: '10px 15px',
						borderBottom: '1px solid #e5e7eb',
						fontWeight: '500'
					}}>
						响应结果
					</div>
					<pre style={{ 
						margin: 0,
						padding: '15px', 
						overflow: 'auto',
						maxHeight: '500px',
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-all',
						fontSize: '14px',
						lineHeight: '1.5'
					}}>
						{response}
					</pre>
				</div>
			)}

			<div style={{ 
				marginTop: '30px', 
				fontSize: '14px', 
				color: '#666',
				background: '#f9fafb',
				padding: '20px',
				borderRadius: '8px'
			}}>
				<h3 style={{ marginTop: 0, color: '#111' }}>使用说明：</h3>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
					<div>
						<h4 style={{ color: '#0070f3' }}>📝 基本用法</h4>
						<ul style={{ paddingLeft: '20px' }}>
							<li><strong>GET请求</strong>: <code>/p?url=目标URL</code></li>
							<li><strong>POST请求</strong>: <code>/p?url=目标URL</code> + JSON body</li>
							<li><strong>M3U8处理</strong>: 自动代理内部分段链接</li>
						</ul>
					</div>
					
					<div>
						<h4 style={{ color: '#10b981' }}>🎯 示例</h4>
						<ul style={{ paddingLeft: '20px' }}>
							<li>代理视频: <code>/p?url=https://example.com/video.m3u8</code></li>
							<li>代理API: <code>/p?url=https://api.example.com/data</code></li>
							<li>带参数: <code>/p?url=https://api.com/data&param=value</code></li>
						</ul>
					</div>
					
					<div>
						<h4 style={{ color: '#8b5cf6' }}>⚡ 特性</h4>
						<ul style={{ paddingLeft: '20px' }}>
							<li>自动跨域支持</li>
							<li>保持原始响应头</li>
							<li>M3U8智能重写</li>
							<li>支持所有HTTP方法</li>
						</ul>
					</div>
				</div>
				
				<div style={{ 
					marginTop: '20px', 
					padding: '15px',
					background: '#eef2ff',
					borderRadius: '6px',
					borderLeft: '4px solid #6366f1'
				}}>
					<strong>💡 提示：</strong> 
					可以直接在视频播放器中使用代理链接，如：
					<code style={{ 
						display: 'block', 
						marginTop: '5px',
						padding: '8px',
						background: 'white',
						borderRadius: '4px',
						fontSize: '12px'
					}}>
						{window.location.origin}/p?url=https://example.com/master.m3u8
					</code>
				</div>
			</div>
		</div>
	);
}