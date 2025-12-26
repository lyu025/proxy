import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export const runtime='edge';

export async function GET(request){
	try{
		const url=new URL(request.url);
		const searchParams=url.searchParams;
		const targetUrl=searchParams.get('url');
		if(!targetUrl)return NextResponse.json({error:'缺少 URL 参数'},{status:400});
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
			return NextResponse.json({error:'无效的 URL 格式'},{status:400});
		}
		//发起代理请求
		let response;
		try{
			response=await fetch(decodedUrl,{
				method:'GET',
				headers:{
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Accept':'*/*',
					'Referer':`${urlObj.protocol}//${urlObj.hostname}/`,
					'Origin':`${urlObj.protocol}//${urlObj.hostname}`
				},
				redirect:'follow'
			});
		}catch(fetchError){
			console.error('代理请求失败:',fetchError);
			return NextResponse.json(
				{error:'无法连接到目标服务器'},
				{status:502}
			);
		}
		if(!response.ok){
			return new Response(
				`目标服务器响应错误: ${response.status}`,
				{status:response.status}
			);
		}
		//获取响应头
		const contentType=response.headers.get('content-type')||'application/octet-stream';
		const contentLength=response.headers.get('content-length');
		//创建响应头
		const headers=new Headers({
			'Content-Type':contentType,
			'Cache-Control':'public, max-age=86400',
			'Access-Control-Allow-Origin':'*',
			'Access-Control-Allow-Methods':'GET, OPTIONS'
		});
		if(contentLength){
			headers.set('Content-Length',contentLength);
		}
		//添加原始的一些响应头
		const keepHeaders=[
			'content-disposition',
			'content-range',
			'etag',
			'last-modified'
		];
		keepHeaders.forEach(header=>{
			const value=response.headers.get(header);
			if(value){
				headers.set(header,value);
			}
		});
		//返回代理的响应
		return new Response(response.body,{
			status:response.status,
			headers:headers
		});
	}catch(error){
		console.error('代理处理失败:',error);
		console.error('错误堆栈:',error.stack);
		return NextResponse.json(
			{
				error:'代理处理失败',
				message:error.message,
				stack:process.env.NODE_ENV==='development'?error.stack:undefined
			},
			{status:500}
		);
	}
}
//处理 OPTIONS 请求
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