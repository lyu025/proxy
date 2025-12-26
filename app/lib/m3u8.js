import {validateUrl,getBaseUrl,buildProxyUrl} from './utils';
/*处理 M3U8 请求*/
export async function handleM3U8Request(request){
	try{
		const url=new URL(request.url);
		const targetUrl=url.searchParams.get('url');
		if(!targetUrl)return createErrorResponse('缺少 URL 参数',400);
		//验证 URL
		const validUrl=validateUrl(targetUrl);
		if(!validUrl)return createErrorResponse('无效的 URL 格式',400);
		console.log('M3U8 请求:',validUrl);
		//获取原始内容
		const response=await fetch(validUrl,{
			headers:{
				'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				'Accept':'application/vnd.apple.mpegurl, application/x-mpegurl, text/plain, */*',
				'Referer':getBaseUrl(validUrl)||validUrl
			},
			redirect:'follow'
		});
		if(!response.ok)return createErrorResponse(`无法获取内容: ${response.status}`,response.status);
		const contentType=response.headers.get('content-type')||'';
		const content=await response.text();
		//检查是否是 M3U8
		if(!content.includes('#EXTM3U'))return createErrorResponse('不是有效的 M3U8 文件',400);
		//处理 M3U8 内容
		const baseUrl=getBaseUrl(validUrl)||validUrl;
		const proxyBaseUrl=url.origin;
		const processedContent=await processM3U8(content,baseUrl,proxyBaseUrl);
		//返回处理后的内容
		return new Response(processedContent,{
			status:200,headers:{
				'Content-Type':'application/vnd.apple.mpegurl',
				'Cache-Control':'public, max-age=600',
				'Access-Control-Allow-Origin':'*',
				'X-Processed-By':'M3U8-P-MW'
			}
		});
	}catch(error){
		console.error('M3U8 处理错误:',error);
		return createErrorResponse(`处理失败: ${error.message}`,500);
	}
}
/*处理 M3U8 内容*/
async function processM3U8(content,baseUrl,proxyBaseUrl){
	const lines=content.split('\n');
	const result=[];
	for(let i=0;i<lines.length;i++){
		const line=lines[i];
		const trimmed=line.trim();
		//空行保留
		if(line===''){
			result.push('');
			continue;
		}
		//注释行保留
		if(trimmed.startsWith('#')){
			result.push(line);
			continue;
		}
		//处理资源行
		if(trimmed){
			//处理各种 URL 格式
			let resourceUrl=trimmed;
			//协议相对 URL
			if(trimmed.startsWith('//'))resourceUrl=`https:${trimmed}`;
			//相对路径
			else if(!trimmed.startsWith('http')){
				try{
					resourceUrl=new URL(trimmed,baseUrl).toString();
				}catch{
					//简单拼接作为后备
					const separator=baseUrl.endsWith('/')||trimmed.startsWith('/')?'':'/';
					resourceUrl=`${baseUrl}${separator}${trimmed}`;
				}
			}
			//构建代理 URL
			const proxyUrl=buildProxyUrl(resourceUrl,proxyBaseUrl);
			result.push(proxyUrl);
		}else result.push(line);
	}
	return result.join('\n');
}
/*创建错误响应*/
function createErrorResponse(message,status=500){
	return new Response(
		JSON.stringify({error:message,timestamp:new Date().toISOString(),status}),
		{
			status:status,
			headers:{
				'Content-Type':'application/json',
				'Access-Control-Allow-Origin':'*'
			}
		}
	);
}