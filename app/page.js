export default function HomePage(){
	return(
		<div style={{maxWidth:800,margin:'0 auto'}}>
			<h1>🎬 视频代理服务</h1>
			<p style={{color:'#666',marginBottom:30}}>
				支持 M3U8 视频流处理和通用网络代理
			</p>
			
			<div style={{
				backgroundColor:'white',
				padding:25,
				borderRadius:10,
				boxShadow:'0 2px 10px rgba(0,0,0,0.1)'
			}}>
				<h2>📖 使用说明</h2>
				
				<h3>1. 通用代理</h3>
				<pre style={{
					backgroundColor:'#f8f9fa',
					padding:15,
					borderRadius:6,
					overflow:'auto'
				}}>{`GET  /p?url=https://example.com/video.mp4`}</pre>
				
				<h3>2. M3U8 处理</h3>
				<pre style={{
					backgroundColor:'#f8f9fa',
					padding:15,
					borderRadius:6,
					overflow:'auto'
				}}>{`GET  /m?url=https://example.com/playlist.m3u8`}</pre>
				
				<h3>3. 示例代码</h3>
				<pre style={{
					backgroundColor:'#f8f9fa',
					padding:15,
					borderRadius:6,
					overflow:'auto'
				}}>
{`//在视频播放器中直接使用
const m3u8Url=
	'https://proxy-pied-one.vercel.app/m?url='
	+encodeURIComponent('原始M3U8链接');

//或者直接代理视频片段
const videoUrl=
	'https://proxy-pied-one.vercel.app/p?url='
	+encodeURIComponent('原始视频链接');`}
				</pre>
				
				<div style={{marginTop:30,padding:15,backgroundColor:'#e8f4fd',borderRadius:6}}>
					<strong>⚠️ 注意事项：</strong>
					<ul style={{margin:'10px 0 0 0',paddingLeft:20}}>
						<li>仅用于学习和技术测试</li>
						<li>请遵守目标网站的 robots.txt</li>
						<li>不要用于商业或侵权用途</li>
						<li>Vercel 免费版有 100GB/月流量限制</li>
					</ul>
				</div>
			</div>
		</div>
	);
}