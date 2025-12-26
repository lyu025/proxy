import{headers}from'next/headers';

/**
*获取完整的请求 URL
*/
export function getFullUrl(){
	const headersList=headers();
	const host=headersList.get('host');
	const protocol=process.env.NODE_ENV==='development'?'http':'https';
	return `${protocol}://${host}`;
}

/**
*检查是否为 M3U8 内容
*/
export function isM3U8Content(contentType,url){
	return(
		contentType?.includes('application/vnd.apple.mpegurl')||
		contentType?.includes('application/x-mpegurl')||
		url?.includes('.m3u8')
	);
}

/**
*提取域名
*/
export function extractDomain(url){
	try{
		const urlObj=new URL(url);
		return urlObj.origin;
	}catch{
		return null;
	}
}

/**
*安全获取目标 URL
*/
export function getTargetUrl(searchParams){
	const url=searchParams.get('url');
	if(!url)return null;
	
	try{
		const decoded=decodeURIComponent(url);
		const urlObj=new URL(decoded);
		return urlObj.toString();
	}catch{
		return null;
	}
}