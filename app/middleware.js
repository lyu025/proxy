import {NextResponse} from 'next/server';
import {handleM3U8Request} from '@/lib/m3u8';
import {handleProxyRequest} from '@/lib/proxy';
//配置中间件匹配路径
export const config={
	matcher:['/m/:path*','/p/:path*','/api/m3u8/:path*','/api/proxy/:path*']
};
//主中间件函数
export async function middleware(request){
	const url=new URL(request.url);
	//记录请求
	console.log(`[Middleware] ${request.method} ${url.pathname}`);
	//处理 OPTIONS 预检请求
	if(request.method==='OPTIONS')return handleOptionsRequest();
	//只处理 GET 请求
	if(request.method!=='GET'&&request.method!=='POST')return new Response('Method Not Allowed',{status:405});
	//根据路径路由到不同的处理器
	try{
		if(url.pathname.startsWith('/m')||url.pathname.startsWith('/api/m3u8'))return await handleM3U8Request(request);
		if(url.pathname.startsWith('/p')||url.pathname.startsWith('/api/proxy'))return await handleProxyRequest(request);
		//如果没有匹配的路径，继续下一个中间件
		return NextResponse.next();
	}catch(error){
		console.error('[Middleware] 处理错误:',error);
		return new Response(
			JSON.stringify({error:'内部服务器错误',message:error.message,path:url.pathname}),
			{
				status:500,headers:{
					'Content-Type':'application/json',
					'Access-Control-Allow-Origin':'*'
				}
			}
		);
	}
}
//处理 OPTIONS 请求
function handleOptionsRequest(){
	return new Response(null,{
		status:200,headers:{
			'Access-Control-Allow-Origin':'*',
			'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Requested-With',
			'Access-Control-Max-Age':'86400',
			'Access-Control-Allow-Credentials':'true'
		}
	});
}
//错误处理函数
function handleError(error,request){
	const url=new URL(request.url);
	console.error(`[Middleware Error] ${url.pathname}:`,error);
	return new Response(
		JSON.stringify({
			error:'请求处理失败',
			details:error.message,path:url.pathname,
			timestamp:new Date().toISOString()
		}),
		{
			status:500,headers:{
				'Content-Type':'application/json',
				'Access-Control-Allow-Origin':'*'
			}
		}
	);
}