import http from'http';
import{CAService}from'./lib/ca_service.mjs';
import{M3U8Rewriter}from'./lib/m3u8_rewriter.mjs';
import{createFetchOptions,isM3U8ContentType,headersToObject,readRequestBody,handleCompressedResponse,cloneResponseForText,cloneResponseForStream}from'./lib/utils.mjs';

const PROXY_PORT=process.env.PROXY_PORT||4000;
const NODE_TLS_REJECT_UNAUTHORIZED=process.env.NODE_TLS_REJECT_UNAUTHORIZED||'0';
process.env.NODE_TLS_REJECT_UNAUTHORIZED=NODE_TLS_REJECT_UNAUTHORIZED;

const caStore=CAService.loadCustomCAs();
const m3u8_rewriter=new M3U8Rewriter(`http://localhost:${PROXY_PORT}`);

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
		const base_url=`https://${req.headers.host}`;
		url=new URL(req.url,base_url);
	}catch(error){
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({error:'Invalid request URL',details:error.message}));
		return;
	}
	const pathname=url.pathname;
	if(pathname.startsWith('/o')){
		await handle_fetch(req,res,url);
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
		service:'proxy',
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
	<h1>Proxy Server</h1>
	<div class="example">
		<h3>使用方式</h3>
		<p>GET <code>/o?u=URL</code></p>
	</div>
	<div class="endpoint">
		<strong>代理端点:</strong>
		<div class="code">GET /o?u={encoded_url}</div>
	</div>
	<div class="endpoint">
		<strong>示例:</strong>
		<div class="code">GET /o?u=https%3A%2F%2Fhttpbin.org%2Fget</div>
	</div>
	<div class="endpoint">
		<strong>状态检查:</strong>
		<div class="code">GET /health</div>
	</div>
	<p style="margin-top:30px;color:#666;">
		TLS验证: <strong>${NODE_TLS_REJECT_UNAUTHORIZED==='0'?'已禁用':'已启用'}</strong>
	</p>
</body>
</html>`;
	res.end(html);
}
async function handle_fetch(req,res,url){
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
	let parsed_url;
	try{
		parsed_url=new URL(target_url);
	}catch(url_error){
		res.writeHead(400,{'Content-Type':'application/json'});
		res.end(JSON.stringify({
			error:'Invalid URL format',
			url:target_url,
			details:url_error.message,
			suggestion:'URL应包含协议(http://或https://)和有效域名'
		}));
		return;
	}
	try{
		const options=await createFetchOptions(req,caStore,target_url);
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
		try{
			original_response=await fetch(target_url,options);
		}catch(fetch_error){
			if(target_url.startsWith('https://')){
				const http_url=target_url.replace('https://','http://');
				try{
					original_response=await fetch(http_url,options);
					target_url=http_url;
				}catch{
					throw fetch_error;
				}
			}else{
				throw fetch_error;
			}
		}
		const fetch_time=Date.now()-start_time;
		//处理压缩内容（如果需要）
		let processed_response=original_response;
		const content_encoding=original_response.headers.get('content-encoding');
		if(content_encoding&&content_encoding!=='identity'){
			processed_response=await handleCompressedResponse(original_response);
		}
		
		//获取响应头
		const response_headers=headersToObject(processed_response.headers);
		response_headers['via']='1.1 proxy-server';
		response_headers['x-proxy-server']='universal-proxy/2.0';
		response_headers['x-proxy-time']=`${fetch_time}ms`;
		delete response_headers['content-security-policy'];
		delete response_headers['x-frame-options'];
		
		const content_type=response_headers['content-type']||'';
		const is_m3u8=isM3U8ContentType(content_type);
		
		if(is_m3u8){
			//对于M3U8，克隆Response用于读取文本
			const text_response=await cloneResponseForText(processed_response);
			try{
				const text=await text_response.text();
				const rewritten=await m3u8_rewriter.rewrite(text,target_url);
				response_headers['content-type']='application/vnd.apple.mpegurl;charset=utf-8';
				response_headers['content-length']=Buffer.byteLength(rewritten).toString();
				res.writeHead(processed_response.status,response_headers);
				res.end(rewritten);
			}catch(m3u8_error){
				//回退到原始响应
				await stream_response(res,processed_response,response_headers);
			}
		}else{
			//对于其他内容，直接流式传输
			await stream_response(res,processed_response,response_headers);
		}
	}catch(error){
		res.writeHead(502,{
			'Content-Type':'application/json',
			'Access-Control-Allow-Origin':'*'
		});
		const error_response={
			error:'Proxy Error',
			message:error.message,
			url:target_url,
			method:req.method,
			timestamp:new Date().toISOString()
		};
		res.end(JSON.stringify(error_response,null,2));
	}
}

/* 安全的流式传输 */
async function stream_response(res,fetch_response,headers){
	//发送头部
	res.writeHead(fetch_response.status,headers);
	//使用可读流
	const reader=fetch_response.body.getReader();
	let total_bytes=0;
	try{
		while(true){
			const{done,value}=await reader.read();
			if(done){
				res.end();
				break;
			}
			total_bytes+=value.length;
			res.write(value);
		}
	}catch(error){
		if(!res.headersSent)res.writeHead(500);
		res.end();
	}finally{
		reader.releaseLock();
	}
}

server.listen(PROXY_PORT,'0.0.0.0',()=>{
	console.log('='.repeat(60));
	console.log('🚀 Universal Proxy Server');
	console.log('='.repeat(60));
	console.log(`📡 地址: https://proxy-hy47.onrender.com`);
	console.log(`🔐 TLS验证: ${NODE_TLS_REJECT_UNAUTHORIZED==='0'?'禁用':'启用'}`);
	console.log(`📊 健康检查: /health`);
	console.log(`🔗 代理端点: /o?u={url}`);
	console.log(`⚠️ Response处理:已修复body复用问题`);
	CAService.hasCertificatesLoaded();
	console.log('='.repeat(60));
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