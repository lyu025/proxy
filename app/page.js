'use client';

import {useState} from 'react';

export default function HomePage(){
	const[url,setUrl]=useState('');
	const[result,setResult]=useState('');
	const[loading,setLoading]=useState(false);

	const handleTest=async(type)=>{
		if(!url){
			alert('请输入 URL');
			return;
		}

		setLoading(true);
		try{
			const encodedUrl=encodeURIComponent(url);
			const endpoint=type==='m'?`/m?url=${encodedUrl}`:`/p?url=${encodedUrl}`;
			
			const response=await fetch(endpoint);
			const text=await response.text();
			
			setResult(text.substring(0,1000)+(text.length>1000?'...':''));
			
			if(type==='m'&&response.ok){
				const blob=new Blob([text],{type:'application/vnd.apple.mpegurl'});
				const downloadUrl=URL.createObjectURL(blob);
				const a=document.createElement('a');
				a.href=downloadUrl;
				a.download='playlist.m3u8';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(downloadUrl);
			}
		}catch(error){
			setResult(`错误:${error.message}`);
		}finally{
			setLoading(false);
		}
	};

	return(
		<div style={{
			backgroundColor:'white',
			borderRadius:'20px',
			padding:'40px',
			boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
		}}>
			<header style={{textAlign:'center',marginBottom:'40px'}}>
				<h1 style={{
					fontSize:'2.5rem',
					background:'linear-gradient(90deg,#667eea,#764ba2)',
					WebkitBackgroundClip:'text',
					WebkitTextFillColor:'transparent',
					marginBottom:'10px'
				}}>
					🚀 视频代理服务
				</h1>
				<p style={{color:'#666',fontSize:'1.1rem'}}>
					基于 Next.js 中间件的视频代理和 M3U8 处理服务
				</p>
			</header>

			<div style={{marginBottom:'30px'}}>
				<div style={{display:'flex',gap:'10px',marginBottom:'20px'}}>
					<input
						type="text"
						value={url}
						onChange={(e)=>setUrl(e.target.value)}
						placeholder="输入视频 URL 或 M3U8 链接"
						style={{
							flex:1,
							padding:'15px',
							border:'2px solid #e0e0e0',
							borderRadius:'10px',
							fontSize:'16px',
							outline:'none',
							transition:'border-color 0.3s'
						}}
					/>
				</div>

				<div style={{display:'flex',gap:'15px',flexWrap:'wrap'}}>
					<button
						onClick={()=>handleTest('m')}
						disabled={loading}
						style={{
							padding:'15px 30px',
							backgroundColor:'#667eea',
							color:'white',
							border:'none',
							borderRadius:'10px',
							fontSize:'16px',
							cursor:'pointer',
							transition:'transform 0.2s',
							display:'flex',
							alignItems:'center',
							gap:'10px'
						}}
					>
						{loading?'处理中...':'🎬 处理 M3U8'}
					</button>
					<button
						onClick={()=>handleTest('p')}
						disabled={loading}
						style={{
							padding:'15px 30px',
							backgroundColor:'#764ba2',
							color:'white',
							border:'none',
							borderRadius:'10px',
							fontSize:'16px',
							cursor:'pointer',
							transition:'transform 0.2s',
							display:'flex',
							alignItems:'center',
							gap:'10px'
						}}
					>
						{loading?'处理中...':'🔗 代理文件'}
					</button>
				</div>
			</div>
			{result&&(
				<div style={{marginTop:'30px',padding:'20px',backgroundColor:'#f8f9fa',borderRadius:'10px',border:'1px solid #e0e0e0'}}>
					<h3 style={{marginBottom:'15px',color:'#333'}}>
						{result.includes('错误')?'❌ 错误信息':'📋 处理结果'}
					</h3>
					<pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:'14px',color:'#666',maxHeight:'300px',overflowY:'auto'}}>
						{result}
					</pre>
				</div>
			)}
			<div style={{marginTop:'40px'}}>
				<h2 style={{marginBottom:'20px',color:'#333'}}>📖 使用示例</h2>
				<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'20px'}}>
					<div style={{padding:'20px',backgroundColor:'#f0f7ff',borderRadius:'10px',border:'1px solid #d1e7ff'}}>
						<h4 style={{color:'#0066cc',marginBottom:'10px'}}>M3U8 处理</h4>
						<code style={{display:'block',padding:'15px',backgroundColor:'white',borderRadius:'5px',fontSize:'14px',overflowX:'auto'}}>
{`GET  /m?url=https://example.com/playlist.m3u8

功能：
✅ 自动处理相对路径
✅ 替换为代理链接
✅ 支持多级 M3U8
✅ 保持所有标签`}
						</code>
					</div>
					<div style={{padding:'20px',backgroundColor:'#fff0f7',borderRadius:'10px',border:'1px solid #ffd1e7'}}>
						<h4 style={{color:'#cc0066',marginBottom:'10px'}}>文件代理</h4>
						<code style={{display:'block',padding:'15px',backgroundColor:'white',borderRadius:'5px',fontSize:'14px',overflowX:'auto'}}>
{`GET  /p?url=https://example.com/video.ts

功能：
✅ 跨域代理
✅ 支持流式传输
✅ 保持原始格式
✅ 自动缓存`}
						</code>
					</div>
				</div>
			</div>
			<div style={{marginTop:'40px',padding:'20px',backgroundColor:'#fff8e1',borderRadius:'10px',border:'1px solid #ffecb3'}}>
				<h3 style={{color:'#ff9800',marginBottom:'10px'}}>⚠️ 注意事项</h3>
				<ul style={{color:'#666',paddingLeft:'20px'}}>
					<li>仅用于学习和测试目的</li>
					<li>请遵守相关网站的使用条款</li>
					<li>Vercel 免费版每月 100GB 流量限制</li>
					<li>支持大多数视频格式：.ts,.mp4,.m4s 等</li>
					<li>自动处理 CORS 跨域问题</li>
				</ul>
			</div>
			<footer style={{marginTop:'40px',textAlign:'center',color:'#666',paddingTop:'20px',borderTop:'1px solid #e0e0e0'}}>
				<p>基于 Next.js 14+Vercel 构建|中间件版本 v1.0</p>
			</footer>
		</div>
	);
}