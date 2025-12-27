/**
 * 工具函数模块 - 添加Cloudflare支持
 */

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

export const createFetchOptions=async(req,caStore,target_url)=>{
	const options={
		method:req.method,
		headers:cloneHeaders(req.headers),
		//redirect:'manual',
		timeout:60000//增加到60秒
	};
	//移除所有可能引起问题的头
	options.headers.delete('accept-encoding');
	options.headers.set('accept-encoding','identity');
	options.headers.delete('host');
	options.headers.delete('connection');
	options.headers.delete('content-length');
	options.headers.delete('cf-ray');
	options.headers.delete('cf-connecting-ip');
	options.headers.delete('cf-ipcountry');
	options.headers.delete('cf-visitor');
	//设置标准浏览器头绕过Cloudflare
	if(!options.headers.has('user-agent')){
		options.headers.set('user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
	}
	if(!options.headers.has('accept')){
		options.headers.set('accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8');
	}
	if(!options.headers.has('accept-language')){
		options.headers.set('accept-language','en-US,en;q=0.9');
	}
	if(!options.headers.has('cache-control')){
		options.headers.set('cache-control','no-cache');
	}
	if(!options.headers.has('upgrade-insecure-requests')){
		options.headers.set('upgrade-insecure-requests','1');
	}
	//添加referer避免被屏蔽
	const referer_url=new URL(target_url);
	if(!options.headers.has('referer')){
		options.headers.set('referer',referer_url.origin+'/');
	}
	const tls_options={};
	let hostname='localhost';
	try{
		const url_obj=new URL(target_url);
		hostname=url_obj.hostname;
	}catch{}
	if(caStore){
		tls_options.ca=caStore;
		tls_options.rejectUnauthorized=true;
		tls_options.servername=hostname;
	}else{
		tls_options.rejectUnauthorized=false;
		tls_options.servername=hostname;
		tls_options.minVersion='TLSv1.2';
		tls_options.maxVersion='TLSv1.3';
		//添加更多TLS选项
		tls_options.ciphers='ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305';
	}
	const{Agent}=await import('undici');
	options.dispatcher=new Agent({
		connect:{
			tls:tls_options,
			timeout:15000,
			rejectUnauthorized:tls_options.rejectUnauthorized,
			//添加socket选项
			servername:hostname,
			//伪装成普通浏览器
			headers:{
				'User-Agent':options.headers.get('user-agent'),
				'Accept':options.headers.get('accept')
			}
		},
		headersTimeout:60000,
		bodyTimeout:60000,
		//启用keep-alive
		keepAliveTimeout:5000,
		keepAliveMaxTimeout:60000,
		maxRedirections:3
	});
	return options;
};

export const isM3U8ContentType=(contentType)=>{
	if(!contentType)return false;
	const ct=contentType.toLowerCase();
	return ct.includes('application/vnd.apple.mpegurl')||
		   ct.includes('application/x-mpegurl')||
		   ct.includes('audio/x-mpegurl')||
		   ct.includes('text/plain')&&ct.includes('m3u8');
};

export const headersToObject=(headers)=>{
	const obj={};
	if(!headers)return obj;
	try{
		if(headers.entries){
			for(const[key,value]of headers.entries()){
				const key_lower=key.toLowerCase();
				//移除Cloudflare相关头
				if(!key_lower.startsWith('cf-')&&
				   key_lower!=='set-cookie'&&
				   key_lower!=='content-encoding'&&
				   key_lower!=='transfer-encoding'){
					obj[key]=value;
				}
			}
		}else{
			for(const key in headers){
				const key_lower=key.toLowerCase();
				if(!key_lower.startsWith('cf-')&&
				   key_lower!=='set-cookie'&&
				   key_lower!=='content-encoding'&&
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
	console.log(`检测到压缩内容:${content_encoding}`);
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
 * 模拟浏览器请求以避免被Cloudflare屏蔽
 */
export const simulateBrowserRequest=(url)=>{
	const headers=new Headers();
	headers.set('user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
	headers.set('accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8');
	headers.set('accept-language','en-US,en;q=0.9');
	headers.set('accept-encoding','gzip, deflate, br');
	headers.set('cache-control','no-cache');
	headers.set('pragma','no-cache');
	headers.set('upgrade-insecure-requests','1');
	headers.set('sec-ch-ua','"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
	headers.set('sec-ch-ua-mobile','?0');
	headers.set('sec-ch-ua-platform','"Windows"');
	headers.set('sec-fetch-site','none');
	headers.set('sec-fetch-mode','navigate');
	headers.set('sec-fetch-user','?1');
	headers.set('sec-fetch-dest','document');
	return headers;
};