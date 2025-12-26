import {NextResponse} from 'next/server';
import {getFullUrl,isM3U8Content,extractDomain} from '@/lib/utils';

export const dynamic='force-dynamic';
export const runtime='edge';

export async function GET(request){
	try{
		const{searchParams,origin}=new URL(request.url);
		const targetUrl=searchParams.get('url');
		
		if(!targetUrl){
			return NextResponse.json(
				{error:'缺少 URL 参数'},
				{status:400}
			);
		}
		
		//解码 URL
		const decodedUrl=decodeURIComponent(targetUrl);
		
		//验证 URL 格式
		let urlObj;
		try{
			urlObj=new URL(decodedUrl);
		}catch{
			return NextResponse.json(
				{error:'无效的 URL'},
				{status:400}
			);
		}
		
		//获取原始 M3U8 内容
		const response=await fetch(decodedUrl,{
			headers: {
				'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				Referer:`${urlObj.protocol}//${urlObj.hostname}/`,
				Accept:'application/vnd.apple.mpegurl, application/x-mpegurl, */*'
			}
		});
		
		if(!response.ok){
			return NextResponse.json(
				{error:`无法获取 M3U8 文件: ${response.status}`},
				{status:response.status}
			);
		}
		
		//读取 M3U8 内容
		const m3u8Text=await response.text();
		const contentType=response.headers.get('content-type')||'';
		
		//检查是否是 M3U8 文件
		if(!isM3U8Content(contentType,decodedUrl)&&
				!m3u8Text.includes('#EXTM3U')){
			return NextResponse.json(
				{error:'不是有效的 M3U8 文件'},
				{status:400}
			);
		}
		
		//获取基础 URL 用于相对路径
		const baseUrl=extractDomain(decodedUrl)||urlObj.origin;
		const proxyBaseUrl=origin||getFullUrl();
		
		//处理 M3U8 内容
		const processedContent=processM3U8(m3u8Text,baseUrl,proxyBaseUrl);
		
		//返回处理后的内容
		return new Response(processedContent,{
			status:200,
			headers:{
				'Content-Type':'application/vnd.apple.mpegurl',
				'Cache-Control':'public, max-age=300',
				'Access-Control-Allow-Origin':'*'
			}
		});
		
	}catch(error){
		console.error('M3U8 处理失败:',error);
		return NextResponse.json(
			{error:'M3U8 处理失败:'+error.message},
			{status:500}
		);
	}
}

/**
*处理 M3U8 内容，替换其中的链接
*/
function processM3U8(content,baseUrl,proxyBaseUrl){
	const lines=content.split('\n');
	const processedLines=[];
	
	for(let line of lines){
		const trimmedLine=line.trim();
		
		//跳过空行和注释（除了特殊的 M3U8 标签）
		if(!trimmedLine||trimmedLine.startsWith('#')&&
				!trimmedLine.startsWith('#EXTINF:')){
			processedLines.push(line);
			continue;
		}
		
		//处理可能是资源链接的行
		if(!trimmedLine.startsWith('#')){
			//检查是否是完整的 URL
			if(trimmedLine.startsWith('http://')||trimmedLine.startsWith('https://')){
				//完整 URL，直接代理
				const proxiedUrl=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(trimmedLine)}`;
				processedLines.push(proxiedUrl);
			}else{
				//相对路径，转换为完整 URL 后再代理
				const fullUrl=new URL(trimmedLine,baseUrl).toString();
				const proxiedUrl=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(fullUrl)}`;
				processedLines.push(proxiedUrl);
			}
		}else{
			processedLines.push(line);
		}
	}
	
	return processedLines.join('\n');
}