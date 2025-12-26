import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';
export const runtime='edge';

export async function GET(request){
	try{
		const{searchParams}=new URL(request.url);
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
		
		//获取原始请求的 headers
		const headers=new Headers();
		request.headers.forEach((value,key)=>{
			//过滤掉一些不应该传递的 headers
			if(!['host','connection','content-length'].includes(key.toLowerCase())){
				headers.set(key,value);
			}
		});
		
		//添加 referer（可选）
		if(urlObj.hostname){
			headers.set('Referer',`${urlObj.protocol}//${urlObj.hostname}/`);
		}
		
		//发起代理请求
		const response=await fetch(decodedUrl,{
			method:'GET',
			headers:headers,
			redirect:'follow'
		});
		
		if(!response.ok){
			return NextResponse.json(
				{error:`目标服务器响应错误: ${response.status}`},
				{status:response.status}
			);
		}
		
		//获取响应内容和类型
		const contentType=response.headers.get('content-type')||'application/octet-stream';
		const contentLength=response.headers.get('content-length');
		
		//创建新的响应
		const proxyResponse=new Response(response.body,{
			status:response.status,
			statusText:response.statusText,
			headers:{
				'Content-Type':contentType,
				'Cache-Control':'public, max-age=3600',
				'Access-Control-Allow-Origin':'*',
				...(contentLength&&{'Content-Length':contentLength})
			}
		});
		
		return proxyResponse;
		
	}catch(error){
		console.error('代理请求失败:',error);
		return NextResponse.json(
			{error:'代理请求失败: '+error.message},
			{status:500}
		);
	}
}