import {validateUrl} from './utils';
/*处理代理请求*/
export async function handleProxyRequest(request){
	try{
		const url=new URL(request.url);
		const targetUrl=url.searchParams.get('url');
		if(!targetUrl)return createErrorResponse('缺少 URL 参数',400);
		//验证 URL
		const validUrl=validateUrl(targetUrl);
		if(!validUrl)return createErrorResponse('无效的 URL 格式',400);
		console.log('代理请求:',validUrl);
		//设置请求超时
		const controller=new AbortController();
		const timeoutId=setTimeout(()=>controller.abort(),30000);//30秒超时
		try{
			//发起代理请求
			const response=await fetch(validUrl,{
				signal:controller.signal,
				headers:{
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Accept':'*/*',
					'Referer':getBaseUrl(validUrl)||validUrl,
					'Origin':getBaseUrl(validUrl)||validUrl
				},
				redirect:'follow'
			});
			clearTimeout(timeoutId);
			if(!response.ok)return createErrorResponse(`目标服务器错误: ${response.status}`,response.status);
			//构建响应头
			const headers=new Headers();
			//复制有用的响应头
			const contentType=response.headers.get('content-type')||'application/octet-stream';
			const contentLength=response.headers.get('content-length');
			headers.set('Content-Type',contentType);
			headers.set('Cache-Control','public, max-age=31536000');//1年缓存
			headers.set('Access-Control-Allow-Origin','*');
			headers.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
			headers.set('Access-Control-Expose-Headers','*');
			if(contentLength)headers.set('Content-Length',contentLength);
			//复制其他有用的头
			const headersToCopy=[
				'content-disposition',
				'content-range',
				'accept-ranges',
				'etag',
				'last-modified',
				'expires'
			];
			headersToCopy.forEach(header=>{
				const value=response.headers.get(header);
				if(value)headers.set(header,value);
			});
			//返回代理的响应
			return new Response(response.body,{status:response.status,headers});
		}catch(fetchError){
			clearTimeout(timeoutId);
			if(fetchError.name==='AbortError')return createErrorResponse('请求超时',504);
			throw fetchError;
		}
	}catch(error){
		console.error('代理处理错误:',error);
		return createErrorResponse(`代理失败: ${error.message}`,500);
	}
}
/*获取基础 URL*/
function getBaseUrl(urlString){
	try{
		const url=new URL(urlString);
		return `${url.protocol}//${url.hostname}`;
	}catch{
		return null;
	}
}
/*创建错误响应*/
function createErrorResponse(message,status=500){
	return new Response(
		JSON.stringify({error:message,timestamp:new Date().toISOString(),status}),
		{
			status:status,headers:{
				'Content-Type':'application/json',
				'Access-Control-Allow-Origin':'*'
			}
		}
	);
}