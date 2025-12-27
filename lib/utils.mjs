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
				if(value!==undefined&&value!==null)result.set(key,String(value));
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
		redirect:'manual',
		timeout:30000
	};
	//重要：不要请求压缩内容
	options.headers.delete('accept-encoding');
	options.headers.set('accept-encoding','identity');//只接受未压缩
	options.headers.delete('host');
	options.headers.delete('connection');
	options.headers.delete('content-length');
	if(!options.headers.has('user-agent')){
		options.headers.set('user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
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
		tls_options.minVersion='TLSv1';
		tls_options.maxVersion='TLSv1.3';
	}
	const{Agent}=await import('undici');
	options.dispatcher=new Agent({
		connect:{
			tls:tls_options,
			timeout:10000,
			rejectUnauthorized:tls_options.rejectUnauthorized
		},
		headersTimeout:30000,
		bodyTimeout:30000
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
				//移除所有可能引起问题的头
				const key_lower=key.toLowerCase();
				if(key_lower!=='set-cookie'&&
					 key_lower!=='content-encoding'&&
					 key_lower!=='transfer-encoding'){
					obj[key]=value;
				}
			}
		}else{
			for(const key in headers){
				const key_lower=key.toLowerCase();
				if(key_lower!=='set-cookie'&&
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

/**
 * 克隆Response以便复用
 */
export const cloneResponseForText=async(originalResponse)=>{
	//先读取body内容
	const text=await originalResponse.text();
	//创建新的Response
	return new Response(text,{
		status:originalResponse.status,
		statusText:originalResponse.statusText,
		headers:originalResponse.headers
	});
};

/**
 * 克隆Response以便流式传输
 */
export const cloneResponseForStream=async(originalResponse)=>{
	//读取整个body为buffer
	const buffer=await originalResponse.arrayBuffer();
	//创建新的Response
	return new Response(buffer,{
		status:originalResponse.status,
		statusText:originalResponse.statusText,
		headers:originalResponse.headers
	});
};

/**
 * 处理压缩内容 - 修复版本
 */
export const handleCompressedResponse=async(response)=>{
	const content_encoding=response.headers.get('content-encoding');
	if(!content_encoding||content_encoding==='identity'){
		return response;//没有压缩或已经是未压缩
	}
	console.log(`检测到压缩内容:${content_encoding}`);
	//读取原始数据
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
	//创建新的Response（移除压缩头）
	const headers=new Headers(response.headers);
	headers.delete('content-encoding');
	headers.set('content-length',decompressed.length.toString());
	return new Response(decompressed,{
		status:response.status,
		statusText:response.statusText,
		headers:headers
	});
};