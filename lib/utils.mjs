/**
 * 工具函数模块 - Cloudflare 520修复
 */

// 生成随机IP
const getRandomIP=()=>{
	const parts=Array.from({length:4},()=>Math.floor(Math.random()*255));
	return parts.join('.');
};

// 随机User-Agent池
const USER_AGENTS=[
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Edg/120.0.0.0',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
];

// 生成真实浏览器指纹
const generateBrowserFingerprint=()=>{
	const fingerprints=[
		{
			'sec-ch-ua':'"Google Chrome";v="119","Chromium";v="119","Not?A_Brand";v="24"',
			'sec-ch-ua-mobile':'?0',
			'sec-ch-ua-platform':'"Windows"',
			'sec-fetch-site':'none',
			'sec-fetch-mode':'navigate',
			'sec-fetch-user':'?1',
			'sec-fetch-dest':'document'
		},
		{
			'sec-ch-ua':'"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"',
			'sec-ch-ua-mobile':'?0',
			'sec-ch-ua-platform':'"macOS"',
			'sec-fetch-site':'same-origin',
			'sec-fetch-mode':'navigate',
			'sec-fetch-dest':'document'
		}
	];
	return fingerprints[Math.floor(Math.random()*fingerprints.length)];
};

export const cloneHeaders=(headers)=>{
	const result=new Headers();
	if(!headers)return result;
	if(headers.rawHeaders){
		for(let i=0;i<headers.rawHeaders.length;i+=2){
			const key=headers.rawHeaders[i];
			const value=headers.rawHeaders[i+1];
			if(key&&value!==undefined)result.set(key,String(value));
		}
		return result;
	}
	if(typeof headers==='object'&&!headers.entries){
		for(const key in headers){
			if(Object.prototype.hasOwnProperty.call(headers,key)){
				const value=headers[key];
				if(value!==undefined&&value!==null){
					result.set(key,String(value));
				}
			}
		}
		return result;
	}
	try{
		if(headers.entries){
			for(const[key,value]of headers.entries()){
				if(key&&value!==undefined)result.set(key,String(value));
			}
		}
	}catch(error){
		console.warn('Headers克隆失败:',error.message);
	}
	return result;
};

export const createFetchOptions=async(req,caStore,target_url,isCloudflare=false)=>{
	const options={
		method:req.method,
		headers:cloneHeaders(req.headers),
		redirect:'manual',
		timeout:45000,
		// 禁用压缩，避免CF检测
		compress:false
	};
	
	// 完全清除所有原始头
	const headersToRemove=[
		'host','connection','content-length','accept-encoding',
		'cf-ray','cf-connecting-ip','cf-ipcountry','cf-visitor',
		'x-forwarded-for','x-real-ip','via','x-proxy-id',
		'forwarded','proxy-connection','proxy-authorization'
	];
	headersToRemove.forEach(h=>options.headers.delete(h));
	
	// 设置基础头
	const randomAgent=USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)];
	options.headers.set('user-agent',randomAgent);
	options.headers.set('accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
	options.headers.set('accept-language','en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7');
	options.headers.set('accept-encoding','gzip, deflate, br'); // 让CF决定是否压缩
	options.headers.set('cache-control','no-cache');
	options.headers.set('pragma','no-cache');
	options.headers.set('upgrade-insecure-requests','1');
	
	// 如果是Cloudflare站点，添加完整浏览器指纹
	if(isCloudflare){
		const fingerprint=generateBrowserFingerprint();
		Object.entries(fingerprint).forEach(([k,v])=>options.headers.set(k,v));
		
		// 添加referer
		try{
			const url=new URL(target_url);
			options.headers.set('referer',`${url.origin}/`);
		}catch{}
		
		// 添加随机IP头
		options.headers.set('x-forwarded-for',getRandomIP());
		options.headers.set('x-real-ip',getRandomIP());
	}
	
	const tls_options={
		rejectUnauthorized:false,
		servername:new URL(target_url).hostname,
		minVersion:'TLSv1.2',
		maxVersion:'TLSv1.3',
		// 使用常见浏览器支持的密码套件
		ciphers:[
			'TLS_AES_128_GCM_SHA256',
			'TLS_AES_256_GCM_SHA384',
			'TLS_CHACHA20_POLY1305_SHA256',
			'ECDHE-RSA-AES128-GCM-SHA256',
			'ECDHE-RSA-AES256-GCM-SHA384'
		].join(':'),
		// 伪装成浏览器TLS指纹
		ecdhCurve:'auto',
		honorCipherOrder:true
	};
	
	const{Agent}=await import('undici');
	options.dispatcher=new Agent({
		connect:{
			tls:tls_options,
			timeout:20000,
			rejectUnauthorized:false,
			// 重要：设置ALPN协议
			protocol:'h2',
			// 模拟真实浏览器连接
			servername:new URL(target_url).hostname
		},
		headersTimeout:45000,
		bodyTimeout:45000,
		// 启用连接池
		connections:10,
		keepAliveTimeout:10000,
		keepAliveMaxTimeout:60000,
		// 禁用管道化，避免CF检测
		pipelining:0,
		maxRedirections:2
	});
	
	return options;
};

export const isM3U8ContentType=(contentType)=>{
	if(!contentType)return false;
	const ct=contentType.toLowerCase();
	return ct.includes('application/vnd.apple.mpegurl')||
		   ct.includes('application/x-mpegurl')||
		   ct.includes('audio/x-mpegurl');
};

export const headersToObject=(headers)=>{
	const obj={};
	if(!headers)return obj;
	try{
		if(headers.entries){
			for(const[key,value]of headers.entries()){
				const key_lower=key.toLowerCase();
				// 保留必要头，移除CF检测头
				if(!key_lower.startsWith('cf-')&&
				   !key_lower.startsWith('x-cf-')&&
				   key_lower!=='set-cookie'&&
				   key_lower!=='transfer-encoding'){
					obj[key]=value;
				}
			}
		}else{
			for(const key in headers){
				const key_lower=key.toLowerCase();
				if(!key_lower.startsWith('cf-')&&
				   !key_lower.startsWith('x-cf-')&&
				   key_lower!=='set-cookie'&&
				   key_lower!=='transfer-encoding'){
					obj[key]=headers[key];
				}
			}
		}
	}catch(error){
		console.warn('Headers转换失败:',error.message);
	}
	return obj;
};

export const readRequestBody=(req)=>{
	return new Promise((resolve,reject)=>{
		const chunks=[];
		req.on('data',chunk=>chunks.push(chunk));
		req.on('end',()=>resolve(Buffer.concat(chunks)));
		req.on('error',reject);
	});
};

export const cloneResponseForText=async(originalResponse)=>{
	const text=await originalResponse.text();
	return new Response(text,{
		status:originalResponse.status,
		statusText:originalResponse.statusText,
		headers:originalResponse.headers
	});
};

export const handleCompressedResponse=async(response)=>{
	const content_encoding=response.headers.get('content-encoding');
	if(!content_encoding||content_encoding==='identity'){
		return response;
	}
	console.log(`解压内容:${content_encoding}`);
	const buffer=await response.arrayBuffer();
	let decompressed;
	try{
		const{zlib}=await import('zlib');
		if(content_encoding.includes('gzip')){
			decompressed=await new Promise((resolve,reject)=>{
				zlib.gunzip(Buffer.from(buffer),(err,result)=>{
					if(err)reject(err);
					else resolve(result);
				});
			});
		}else if(content_encoding.includes('deflate')){
			decompressed=await new Promise((resolve,reject)=>{
				zlib.inflate(Buffer.from(buffer),(err,result)=>{
					if(err)reject(err);
					else resolve(result);
				});
			});
		}else if(content_encoding.includes('br')){
			decompressed=await new Promise((resolve,reject)=>{
				zlib.brotliDecompress(Buffer.from(buffer),(err,result)=>{
					if(err)reject(err);
					else resolve(result);
				});
			});
		}else{
			console.warn(`不支持的解压格式:${content_encoding}`);
			return response;
		}
	}catch(decompress_error){
		console.error('解压失败:',decompress_error.message);
		return response;
	}
	const headers=new Headers(response.headers);
	headers.delete('content-encoding');
	headers.set('content-length',decompressed.length.toString());
	return new Response(decompressed,{
		status:response.status,
		statusText:response.statusText,
		headers:headers
	});
};

/**
 * 检测Cloudflare挑战
 */
export const detectCloudflareChallenge=async(response)=>{
	try{
		const text=await response.clone().text();
		const indicators=[
			'cf-ray',
			'cloudflare',
			'jschl_vc',
			'jschl_answer',
			'ddos',
			'checking your browser',
			'just a moment',
			'please enable cookies',
			'security check'
		];
		const lower_text=text.toLowerCase();
		for(const indicator of indicators){
			if(lower_text.includes(indicator)){
				return true;
			}
		}
		// 检查状态码
		if(response.status===503||response.status===403){
			const server=response.headers.get('server');
			if(server&&server.toLowerCase().includes('cloudflare')){
				return true;
			}
		}
	}catch{/*忽略错误*/}
	return false;
};

/**
 * 模拟真实浏览器延迟
 */
export const simulateHumanDelay=()=>{
	const delay=Math.floor(Math.random()*1000)+500;//500-1500ms
	return new Promise(resolve=>setTimeout(resolve,delay));
};