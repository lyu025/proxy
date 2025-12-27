import http from'http';
import{CAService}from'./lib/ca_service.mjs';
import{M3U8Rewriter}from'./lib/m3u8_rewriter.mjs';
import{createFetchOptions,isM3U8ContentType,headersToObject,readRequestBody,handleCompressedResponse,cloneResponseForText,detectCloudflareChallenge,simulateHumanDelay}from'./lib/utils.mjs';

const PROXY_PORT=process.env.PROXY_PORT||4000;
const NODE_TLS_REJECT_UNAUTHORIZED=process.env.NODE_TLS_REJECT_UNAUTHORIZED||'0';
process.env.NODE_TLS_REJECT_UNAUTHORIZED=NODE_TLS_REJECT_UNAUTHORIZED;
const caStore=CAService.loadCustomCAs();
const m3u8_rewriter=new M3U8Rewriter();
// Cloudflare站点缓存
const cfSitesCache=new Map();

const server=http.createServer(async(req,res)=>{
	res.setHeader('Access-Control-Allow-Origin','*');
	res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH');
	res.setHeader('Access-Control-Allow-Headers','*');
	res.setHeader('Access-Control-Expose-Headers','*');
	res.setHeader('Access-Control-Max-Age','86400');
	if(req.method==='OPTIONS'){
		res.writeHead(204).end();
		return;
	}
	let url;
	try{
		const base_url=`http://${req.headers.host||`localhost:${PROXY_PORT}`}`;
		url=new URL(req.url,base_url);
	}catch(error){
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({error:'Invalid request URL',details:error.message}));
		return;
	}
	const pathname=url.pathname;
	console.log(`[${new Date().toISOString()}]${req.method}${pathname}`);
	if(pathname.startsWith('/o')){
		await to_fetch(req,res,url);
	}else if(pathname==='/health'){
		handle_health(req,res);
	}else if(pathname==='/'){
		handle_home(req,res);
	}else{
		res.writeHead(404,{'Content-Type':'text/plain'}).end('Not Found');
	}
});
function handle_health(req,res){
	res.writeHead(200,{
		'Content-Type':'application/json',
		'Cache-Control':'no-cache'
	});
	res.end(JSON.stringify({
		status:'ok',
		timestamp:new Date().toISOString(),
		service:'proxy-server',
		version:'2.0.0',
		port:PROXY_PORT,
		tls_enabled:NODE_TLS_REJECT_UNAUTHORIZED!=='0',
		certificates_loaded:CAService.hasCertificatesLoaded()
	},null,2));
}
function handle_home(req,res){
	res.writeHead(200,{
		'Content-Type':'text/html;charset=utf-8',
		'Cache-Control':'no-cache'
	});
	const html=`<!DOCTYPE html>
<html>
<head>
	<title>Universal Proxy Server</title>
	<meta charset="utf-8">
	<style>
		body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f5f5;}
		h1{color:#333;border-bottom:2px solid #4CAF50;padding-bottom:10px;}
		.code{background:#333;color:#fff;padding:15px;border-radius:5px;overflow-x:auto;margin:15px 0;}
		.example{margin:20px 0;padding:15px;background:#e8f5e8;border-left:4px solid #4CAF50;}
		.endpoint{margin:10px 0;padding:10px;background:#fff;border-radius:4px;border:1px solid #ddd;}
		.warning{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;}
	</style>
</head>
<body>
	<h1>Universal Proxy Server</h1>
	<div class="example">
		<h3>使用方式</h3>
		<p>GET <code>/o?u=URL</code></p>
	</div>
	<div class="warning">
		<strong>Cloudflare绕过说明：</strong>
		<p>1. 自动检测Cloudflare站点</p>
		<p>2. 模拟真实浏览器行为</p>
		<p>3. 支持HTTP/2和TLS指纹伪装</p>
		<p>4. 如遇挑战页面，会自动重试</p>
	</div>
	<div class="endpoint">
		<strong>代理端点:</strong>
		<div class="code">GET /o?u={encoded_url}</div>
	</div>
	<div class="endpoint">
		<strong>Cloudflare站点测试:</strong>
		<div class="code">GET /o?u=https%3A%2F%2Fdiscord.com</div>
	</div>
	<p style="margin-top:30px;color:#666;">
		服务器运行在端口: <strong>${PROXY_PORT}</strong><br>
		Cloudflare绕过: <strong style="color:#4CAF50;">已启用</strong><br>
		支持协议: HTTP/1.1, HTTP/2, TLS 1.2/1.3
	</p>
</body>
</html>`;
	res.end(html);
}
async function to_fetch(req,res,url){
	const target_param=url.searchParams.get('u');
	if(!target_param){
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({error:'Missing u parameter'}));
		return;
	}
	let target_url;
	try{
		target_url=decodeURIComponent(target_param);
	}catch(error){
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({error:'Invalid URL encoding',details:error.message}));
		return;
	}
	console.log(`目标URL:${target_url}`);
	//URL修复
	if(!target_url.includes('://')){
		if(target_url.startsWith('//')){
			target_url='https:'+target_url;
		}else{
			target_url='https://'+target_url;
		}
	}
	target_url=target_url.replace(/\s+/g,'').replace(/\\/g,'/');
	console.log(`修复后URL:${target_url}`);
	let parsed_url;
	try{
		parsed_url=new URL(target_url);
	}catch(url_error){
		console.error(`URL解析失败:${target_url}`,url_error.message);
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({
			error:'Invalid URL format',
			url:target_url,
			details:url_error.message
		}));
		return;
	}
	//检测是否为Cloudflare站点
	const hostname=parsed_url.hostname;
	const isCloudflare=await detectCloudflareSite(hostname);
	console.log(`站点检测:${hostname} ${isCloudflare?'[Cloudflare]':'[普通站点]'}`);
	
	try{
		//模拟人类延迟（仅对Cloudflare站点）
		if(isCloudflare){
			await simulateHumanDelay();
		}
		
		//创建请求选项
		const options=await createFetchOptions(req,caStore,target_url,isCloudflare);
		
		//处理请求体
		if(['POST','PUT','PATCH'].includes(req.method.toUpperCase())){
			try{
				const body_buffer=await readRequestBody(req);
				if(body_buffer.length>0){
					options.body=body_buffer;
					options.headers.set('content-length',body_buffer.length.toString());
				}
			}catch(body_error){
				console.warn('请求体读取失败:',body_error.message);
			}
		}
		
		const start_time=Date.now();
		let response;
		let last_error;
		
		//尝试策略
		const strategies=[
			{name:'直接请求',url:target_url,options},
			{name:'HTTP回退',url:target_url.replace('https://','http://'),options},
			{name:'WWW前缀',url:target_url.replace('://','://www.'),options}
		];
		
		for(const strategy of strategies){
			console.log(`尝试策略:${strategy.name}`);
			try{
				response=await fetch(strategy.url,strategy.options);
				target_url=strategy.url;//更新成功URL
				
				//检查是否是Cloudflare挑战
				const isChallenge=await detectCloudflareChallenge(response);
				if(isChallenge){
					console.log(`检测到Cloudflare挑战[${strategy.name}]`);
					response=null;
					continue;//继续下一个策略
				}
				
				last_error=null;
				break;
			}catch(fetch_error){
				last_error=fetch_error;
				console.log(`策略失败[${strategy.name}]:${fetch_error.message}`);
				//短暂延迟后重试
				await new Promise(r=>setTimeout(r,1000));
			}
		}
		
		if(!response){
			throw last_error||new Error('所有策略均失败');
		}
		
		const fetch_time=Date.now()-start_time;
		console.log(`请求成功:${response.status}(${fetch_time}ms)`);
		
		//更新Cloudflare站点缓存
		if(response.status===200||response.status===304){
			cfSitesCache.set(hostname,isCloudflare);
		}
		
		//处理压缩内容
		let processed_response=response;
		const content_encoding=response.headers.get('content-encoding');
		if(content_encoding&&content_encoding!=='identity'){
			processed_response=await handleCompressedResponse(response);
		}
		
		//准备响应头
		const response_headers=headersToObject(processed_response.headers);
		response_headers['via']='1.1 proxy-server';
		response_headers['x-proxy-server']='universal-proxy/2.0';
		response_headers['x-proxy-time']=`${fetch_time}ms`;
		response_headers['x-cloudflare-bypass']=isCloudflare?'true':'false';
		
		//移除安全头
		delete response_headers['content-security-policy'];
		delete response_headers['x-frame-options'];
		delete response_headers['x-content-type-options'];
		
		const content_type=response_headers['content-type']||'';
		const is_m3u8=isM3U8ContentType(content_type);
		
		if(is_m3u8){
			const text_response=await cloneResponseForText(processed_response);
			try{
				const text=await text_response.text();
				const rewritten=await m3u8_rewriter.rewrite(text,target_url);
				response_headers['content-type']='application/vnd.apple.mpegurl;charset=utf-8';
				response_headers['content-length']=Buffer.byteLength(rewritten).toString();
				res.writeHead(processed_response.status,response_headers);
				res.end(rewritten);
				console.log(`M3U8重写完成`);
			}catch(m3u8_error){
				console.error('M3U8处理失败:',m3u8_error.message);
				await stream_response(res,processed_response,response_headers);
			}
		}else{
			await stream_response(res,processed_response,response_headers);
		}
		
	}catch(error){
		console.error('代理请求失败:',error.message);
		console.error('错误详情:',error.code||error.type);
		
		//针对Cloudflare的错误处理
		let status_code=502;
		let error_message=error.message;
		
		if(error.message.includes('fetch failed')||error.code==='ECONNREFUSED'){
			status_code=503;
			error_message='目标服务器拒绝连接';
		}else if(error.message.includes('timed out')||error.code==='ETIMEDOUT'){
			status_code=504;
			error_message='请求超时';
		}else if(error.message.includes('certificate')||error.code==='CERT_HAS_EXPIRED'){
			status_code=495;
			error_message='SSL证书验证失败';
		}
		
		res.writeHead(status_code,{
			'Content-Type':'application/json',
			'Access-Control-Allow-Origin':'*',
			'Retry-After':'30'
		});
		
		const error_response={
			error:'Proxy Error',
			message:error_message,
			url:target_url,
			timestamp:new Date().toISOString(),
			suggestion:'请检查URL是否正确，或稍后重试'
		};
		
		res.end(JSON.stringify(error_response,null,2));
	}
}
async function stream_response(res,fetch_response,headers){
	res.writeHead(fetch_response.status,headers);
	const reader=fetch_response.body.getReader();
	let total_bytes=0;
	try{
		while(true){
			const{done,value}=await reader.read();
			if(done){
				console.log(`传输完成:${total_bytes}字节`);
				res.end();
				break;
			}
			total_bytes+=value.length;
			res.write(value);
		}
	}catch(error){
		console.error('流传输错误:',error.message);
		if(!res.headersSent)res.writeHead(500);
		res.end();
	}finally{
		reader.releaseLock();
	}
}
/**
 * 检测Cloudflare站点
 */
async function detectCloudflareSite(hostname){
	//检查缓存
	if(cfSitesCache.has(hostname)){
		return cfSitesCache.get(hostname);
	}
	
	//已知Cloudflare站点
	const knownCFSites=[
		'discord.com','discordapp.com',
		'medium.com','stackoverflow.com','stackexchange.com',
		'github.com','gitlab.com',
		'bit.ly','goo.gl','t.co',
		'cloudflare.com','cf.io'
	];
	
	//域名模式匹配
	const cfPatterns=[
		/\.cf$/i,
		/cloudflare\./i,
		/cdn\./i
	];
	
	//检查已知站点
	if(knownCFSites.includes(hostname.toLowerCase())){
		cfSitesCache.set(hostname,true);
		return true;
	}
	
	//检查域名模式
	for(const pattern of cfPatterns){
		if(pattern.test(hostname)){
			cfSitesCache.set(hostname,true);
			return true;
		}
	}
	
	//DNS查询（可选，这里简化）
	cfSitesCache.set(hostname,false);
	return false;
}
server.listen(PROXY_PORT,'0.0.0.0',()=>{
	console.log('='.repeat(60));
	console.log('🚀 Universal Proxy Server v2.1');
	console.log('='.repeat(60));
	console.log(`📡 地址:http://localhost:${PROXY_PORT}`);
	console.log(`🔧 端口:${PROXY_PORT}`);
	console.log(`🛡️ Cloudflare绕过:已启用(全策略)`);
	console.log(`🌐 支持:HTTP/1.1, HTTP/2, TLS 1.2-1.3`);
	console.log(`⚡ 策略:浏览器指纹,TLS伪装,延迟模拟`);
	console.log(`📊 健康检查:http://localhost:${PROXY_PORT}/health`);
	console.log(`🔗 代理端点:http://localhost:${PROXY_PORT}/o?u={url}`);
	console.log(`📝 示例:http://localhost:${PROXY_PORT}/o?u=https://discord.com`);
	if(CAService.hasCertificatesLoaded()){
		console.log('✅ 自定义证书已加载');
	}else{
		console.log('⚠️ 使用不验证证书模式(Cloudflare需要)');
	}
	console.log('='.repeat(60));
	console.log('等待请求...\n');
});
const shutdown=(signal)=>{
	console.log(`\n收到${signal}信号，正在关闭服务器...`);
	server.close((err)=>{
		if(err){
			console.error('服务器关闭错误:',err);
			process.exit(1);
		}
		console.log('服务器已安全关闭');
		process.exit(0);
	});
	setTimeout(()=>{
		console.error('强制关闭服务器');
		process.exit(1);
	},10000);
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('uncaughtException',(error)=>{
	console.error('未捕获异常:',error);
	shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection',(reason,promise)=>{
	console.error('未处理的Promise拒绝:',reason);
});