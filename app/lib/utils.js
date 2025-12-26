/*验证和修复 URL*/
export function validateUrl(url){
	if(!url)return null;
	try{
		//解码 URL
		const decodedUrl=decodeURIComponent(url);
		//如果已经是完整 URL
		if(decodedUrl.startsWith('http://')||decodedUrl.startsWith('https://'))return new URL(decodedUrl).toString();
		//协议相对 URL
		if(decodedUrl.startsWith('//'))return `https:${decodedUrl}`;
		//路径相对 URL，假设使用 HTTPS
		return `https://${decodedUrl}`;
	}catch(error){
		console.error('URL 验证失败:',error);
		return null;
	}
}
/*提取基础 URL*/
export function getBaseUrl(urlString){
	try{
		const url=new URL(urlString);
		return `${url.protocol}//${url.hostname}`;
	}catch{
		return null;
	}
}
/*判断是否为 M3U8 内容*/
export function isM3U8Content(contentType,content){
	const type=contentType||'';
	return(type.includes('mpegurl')||type.includes('m3u8')||(content&&content.includes('#EXTM3U')));
}
/*构建代理 URL*/
export function buildProxyUrl(originalUrl,proxyBaseUrl){
	const encoded=encodeURIComponent(originalUrl);
	return `${proxyBaseUrl}/p?url=${encoded}`;
}
/*安全获取主机头*/
export function getHost(request){
	return request.headers.get('host')||request.headers.get('x-forwarded-host')||'localhost:3000';
}
/*获取协议*/
export function getProtocol(request){
	const forwardedProto=request.headers.get('x-forwarded-proto');
	return forwardedProto==='https'?'https':'http';
}