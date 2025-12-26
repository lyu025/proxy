import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export const runtime='edge';

//辅助函数：安全地创建 URL 对象
function safeCreateURL(url,base){
	try{
		return new URL(url,base);
	}catch{
		return null;
	}
}
//辅助函数：提取主机名
function extractHostname(url){
	try{
		const urlObj=new URL(url);
		return `${urlObj.protocol}//${urlObj.hostname}`;
	}catch{
		//如果不是完整URL，尝试从字符串中提取
		const match=url.match(/^(https?:\/\/[^\/]+)/);
		return match?match[1]:null;
	}
}
export async function GET(request){
	try{
		const url=new URL(request.url);
		const searchParams=url.searchParams;
		const targetUrl=searchParams.get('url');
		if(!targetUrl)return NextResponse.json({error:'缺少 URL 参数'},{status:400})
		//解码 URL
		let decodedUrl;
		try{
			decodedUrl=decodeURIComponent(targetUrl);
		}catch{
			return NextResponse.json({error:'URL 解码失败'},{status:400});
		}
		//验证 URL 格式
		let urlObj;
		try{
			urlObj=new URL(decodedUrl);
		}catch{
			//如果不是完整URL，尝试添加 http://前缀
			try{
				urlObj=new URL(decodedUrl.startsWith('//')?`http:${decodedUrl}`:decodedUrl.includes('://')?decodedUrl:`http://${decodedUrl}`);
			}catch{
				return NextResponse.json({error:'无效的 URL 格式'},{status:400});
			}
		}
		//获取原始 M3U8 内容
		let fetchResponse;
		try{
			fetchResponse=await fetch(urlObj.toString(),{
				headers:{
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Accept':'application/vnd.apple.mpegurl, application/x-mpegurl, text/plain, */*'
				},
				redirect:'follow'
			});
		}catch(fetchError){
			console.error('Fetch 失败:',fetchError);
			return NextResponse.json({error:'无法连接到目标服务器'},{status:502});
		}
		if(!fetchResponse.ok){
			return NextResponse.json(
				{
					error:`无法获取 M3U8 文件: ${fetchResponse.status}`,
					status:fetchResponse.status
				},
				{status:fetchResponse.status}
			);
		}
		//读取 M3U8 内容
		let m3u8Text;
		try{
			m3u8Text=await fetchResponse.text();
		}catch(textError){
			console.error('读取响应文本失败:',textError);
			return NextResponse.json({error:'读取响应内容失败'},{status:500});
		}
		//检查是否是 M3U8 文件
		const contentType=fetchResponse.headers.get('content-type')||'';
		const isM3U8=contentType.includes('mpegurl')||contentType.includes('m3u8')||m3u8Text.includes('#EXTM3U');
		if(!isM3U8){
			return NextResponse.json(
				{
					error:'不是有效的 M3U8 文件',
					contentType:contentType,
					preview:m3u8Text.substring(0,200)
				},
				{status:400}
			);
		}
		//获取基础 URL 用于相对路径
		const baseUrl=extractHostname(urlObj.toString())||`${urlObj.protocol}//${urlObj.hostname}`;
		const proxyBaseUrl=url.origin;
		//处理 M3U8 内容
		const processedContent=processM3U8(m3u8Text,baseUrl,proxyBaseUrl);
		//返回处理后的内容
		return new Response(processedContent,{
			status:200,
			headers:{
				'Content-Type':'application/vnd.apple.mpegurl',
				'Cache-Control':'public, max-age=300',
				'Access-Control-Allow-Origin':'*',
				'Access-Control-Allow-Methods':'GET, OPTIONS',
				'Vary':'Origin'
			}
		});
	}catch(error){
		console.error('M3U8 处理失败:',error);
		console.error('错误堆栈:',error.stack);
		return NextResponse.json(
			{
				error:'M3U8 处理失败',
				message:error.message,
				stack:process.env.NODE_ENV==='development'?error.stack:undefined
			},
			{status:500}
		);
	}
}
/*处理 M3U8 内容，替换其中的链接*/
function processM3U8(content,baseUrl,proxyBaseUrl){
	const lines=content.split('\n');
	const processedLines=[];
	for(let i=0;i<lines.length;i++){
		const line=lines[i];
		const trimmedLine=line.trim();
		//保持原始换行符
		if(line===''){
			processedLines.push('');
			continue;
		}
		//跳过注释行（除了 EXTINF）
		if(trimmedLine.startsWith('#')&&!trimmedLine.startsWith('#EXTINF:')){
			processedLines.push(line);
			continue;
		}
		//处理 EXTINF 后面的行
		if(i>0&&lines[i-1].trim().startsWith('#EXTINF:')){
			if(trimmedLine&&!trimmedLine.startsWith('#')){
				//处理资源链接
				let processedLine;
				if(trimmedLine.startsWith('http://')||trimmedLine.startsWith('https://')){
					//完整 URL
					processedLine=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(trimmedLine)}`;
				}else if(trimmedLine.startsWith('//')){
					//协议相对 URL
					const fullUrl=`https:${trimmedLine}`;
					processedLine=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(fullUrl)}`;
				}else{
					//相对路径
					try{
						const fullUrl=new URL(trimmedLine,baseUrl).toString();
						processedLine=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(fullUrl)}`;
					}catch{
						//如果转换失败，尝试拼接
						const separator=baseUrl.endsWith('/')?'':'/';
						const path=trimmedLine.startsWith('/')?trimmedLine.substring(1):trimmedLine;
						const fullUrl=`${baseUrl}${separator}${path}`;
						processedLine=`${proxyBaseUrl}/proxy?url=${encodeURIComponent(fullUrl)}`;
					}
				}
				processedLines.push(processedLine);
			}else{
				processedLines.push(line);
			}
		}else{
			processedLines.push(line);
		}
	}
	return processedLines.join('\n');
}
//处理 OPTIONS 请求（CORS 预检）
export async function OPTIONS(request){
	return new Response(null,{
		status:200,
		headers:{
			'Access-Control-Allow-Origin':'*',
			'Access-Control-Allow-Methods':'GET, OPTIONS',
			'Access-Control-Allow-Headers':'Content-Type, Authorization',
			'Access-Control-Max-Age':'86400'
		}
	});
}