import http from'http';
import{CAService}from'./lib/ca_service.mjs';
import{M3U8Rewriter}from'./lib/m3u8_rewriter.mjs';
import{createFetchOptions,isM3U8ContentType,headersToObject,readRequestBody,handleCompressedResponse,cloneResponseForText,simulateBrowserRequest}from'./lib/utils.mjs';

const PROXY_PORT=process.env.PROXY_PORT||4000;
const NODE_TLS_REJECT_UNAUTHORIZED=process.env.NODE_TLS_REJECT_UNAUTHORIZED||'0';
process.env.NODE_TLS_REJECT_UNAUTHORIZED=NODE_TLS_REJECT_UNAUTHORIZED;

const caStore=CAService.loadCustomCAs();
const m3u8_rewriter=new M3U8Rewriter();

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
	<title>Proxy Server</title>
	<meta charset="utf-8">
	<style>
		body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f5f5;}
		h1{color:#333;border-bottom:2px solid #4CAF50;padding-bottom:10px;}
		.code{background:#333;color:#fff;padding:15px;border-radius:5px;overflow-x:auto;margin:15px 0;}
		.example{margin:20px 0;padding:15px;background:#e8f5e8;border-left:4px solid #4CAF50;}
		.endpoint{margin:10px 0;padding:10px;background:#fff;border-radius:4px;border:1px solid #ddd;}
	</style>
</head>
<body>
	<h1>Universal Proxy Server</h1>
	<div class="example">
		<h3>使用方式</h3>
		<p>GET <code>/o?u=URL</code></p>
	</div>
	<div class="endpoint">
		<strong>代理端点:</strong>
		<div class="code">GET /o?u={encoded_url}</div>
	</div>
	<div class="endpoint">
		<strong>Cloudflare站点示例:</strong>
		<div class="code">GET /o?u=https%3A%2F%2Fexample.com</div>
	</div>
	<div class="endpoint">
		<strong>状态检查:</strong>
		<div class="code">GET /health</div>
	</div>
	<p style="margin-top:30px;color:#666;">
		服务器运行在端口: <strong>${PROXY_PORT}</strong><br>
		TLS验证: <strong>${NODE_TLS_REJECT_UNAUTHORIZED==='0'?'已禁用':'已启用'}</strong><br>
		Cloudflare支持: <strong>已启用绕过</strong>
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
	console.log(`原始URL:${target_url}`);
	if(!target_url.includes('://')){
		if(target_url.startsWith('//')){
			target_url='https:'+target_url;
		}else if(target_url.startsWith('www.')){
			target_url='https://'+target_url;
		}else{
			target_url='https://'+target_url;
		}
	}
	target_url=target_url.replace(/\s+/g,'').replace(/\\/g,'/');
	console.log(`处理后的URL:${target_url}`);
	let parsed_url;
	try{
		parsed_url=new URL(target_url);
		console.log(`URL解析成功:${parsed_url.hostname}`);
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
	console.log(`代理请求:${req.method}${target_url}`);
	//检查是否为Cloudflare站点
	const is_cf_site=isCloudflareSite(parsed_url.hostname);
	if(is_cf_site){
		console.log(`检测到Cloudflare站点:${parsed_url.hostname}`);
	}
	try{
		let options;
		if(is_cf_site){
			//对于Cloudflare站点，使用特殊配置
			options=await createFetchOptions(req,caStore,target_url);
			//添加更多反屏蔽头
			const browser_headers=simulateBrowserRequest(target_url);
			for(const[key,value]of browser_headers.entries()){
				options.headers.set(key,value);
			}
		}else{
			options=await createFetchOptions(req,caStore,target_url);
		}
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
		let original_response;
		console.log(`开始请求:${target_url}`);
		//尝试多种策略
		let last_error;
		for(let attempt=1;attempt<=3;attempt++){
			console.log(`尝试第${attempt}次...`);
			try{
				original_response=await fetch(target_url,options);
				last_error=null;
				break;
			}catch(fetch_error){
				last_error=fetch_error;
				console.log(`尝试${attempt}失败:${fetch_error.message}`);
				if(attempt<3){
					//等待重试
					await new Promise(r=>setTimeout(r,1000*attempt));
					//修改User-Agent
					options.headers.set('user-agent',getRandomUserAgent());
				}
			}
		}
		if(last_error){
			//尝试HTTP回退
			if(target_url.startsWith('https://')){
				const http_url=target_url.replace('https://','http://');
				console.log(`尝试HTTP:${http_url}`);
				try{
					original_response=await fetch(http_url,options);
					target_url=http_url;
				}catch{
					throw last_error;
				}
			}else{
				throw last_error;
			}
		}
		const fetch_time=Date.now()-start_time;
		console.log(`目标响应:${original_response.status}(${fetch_time}ms)`);
		//检查是否是Cloudflare挑战页面
		const response_text=await original_response.clone().text();
		if(isCloudflareChallenge(response_text)){
			console.log('检测到Cloudflare挑战页面');
			res.writeHead(503,{
				'Content-Type':'application/json',
				'Retry-After':'30'
			});
			res.end(JSON.stringify({
				error:'Cloudflare Challenge',
				message:'目标站点启用了Cloudflare防护，请直接访问源站',
				url:target_url,
				timestamp:new Date().toISOString()
			}));
			return;
		}
		//处理压缩内容
		let processed_response=original_response;
		const content_encoding=original_response.headers.get('content-encoding');
		if(content_encoding&&content_encoding!=='identity'){
			processed_response=await handleCompressedResponse(original_response);
		}
		const response_headers=headersToObject(processed_response.headers);
		response_headers['via']='1.1 proxy-server';
		response_headers['x-proxy-server']='universal-proxy/2.0';
		response_headers['x-proxy-time']=`${fetch_time}ms`;
		delete response_headers['content-security-policy'];
		delete response_headers['x-frame-options'];
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
		res.writeHead(502,{
			'Content-Type':'application/json',
			'Access-Control-Allow-Origin':'*'
		});
		const error_response={
			error:'Proxy Error',
			message:error.message,
			url:target_url,
			timestamp:new Date().toISOString()
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
 * 检查是否为Cloudflare站点
 */
function isCloudflareSite(hostname){
	//常见的Cloudflare域名特征
	const cf_patterns=[
		/cloudflare\.com$/i,
		/cf\./i,
		/\.cf$/i
	];
	//常见使用Cloudflare的站点
	const cf_sites=[
		'discord.com',
		'medium.com',
		'stackoverflow.com',
		'github.com',
		'gitlab.com',
		'bit.ly',
		'goo.gl'
	];
	for(const pattern of cf_patterns){
		if(pattern.test(hostname))return true;
	}
	return cf_sites.includes(hostname.toLowerCase());
}
/**
 * 检查是否为Cloudflare挑战页面
 */
function isCloudflareChallenge(text){
	if(!text)return false;
	const cf_indicators=[
		'cloudflare',
		'cf-ray',
		'challenge',
		'jschl_vc',
		'jschl_answer',
		'ddos protection',
		'checking your browser'
	];
	const lower_text=text.toLowerCase();
	for(const indicator of cf_indicators){
		if(lower_text.includes(indicator))return true;
	}
	return false;
}
/**
 * 获取随机User-Agent
 */
function getRandomUserAgent(){
	const agents=[
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Edg/120.0.0.0'
	];
	return agents[Math.floor(Math.random()*agents.length)];
}
server.listen(PROXY_PORT,'0.0.0.0',()=>{
	console.log('='.repeat(60));
	console.log('🚀 Universal Proxy Server');
	console.log('='.repeat(60));
	console.log(`📡 地址:http://localhost:${PROXY_PORT}`);
	console.log(`🔧 端口:${PROXY_PORT}`);
	console.log(`🔐 TLS验证:${NODE_TLS_REJECT_UNAUTHORIZED==='0'?'禁用':'启用'}`);
	console.log(`🛡️ Cloudflare支持:已启用`);
	console.log(`📊 健康检查:http://localhost:${PROXY_PORT}/health`);
	console.log(`🔗 代理端点:http://localhost:${PROXY_PORT}/o?u={url}`);
	console.log(`⚠️ 注意:Cloudflare站点可能需要直接访问`);
	if(CAService.hasCertificatesLoaded()){
		console.log('✅ 自定义证书已加载');
	}else{
		console.log('ℹ️ 未加载自定义证书');
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