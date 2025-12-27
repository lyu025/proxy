/**
 * M3U8重写器模块
 * 智能重写播放列表中的所有URL，使其通过代理
 */
import{M3U8Parser}from'./m3u8_parser.mjs';

export class M3U8Rewriter{
	/**
	 * 初始化重写器
	 * @param {Object} config - 重写配置选项
	 */
	constructor(config={}){
		this.config={
			rewritePatterns:[
				{pattern:/\.ts(?:\?.*)?$/i,rewrite:true},
				{pattern:/\.key(?:\?.*)?$/i,rewrite:true},
				{pattern:/\.m3u8(?:\?.*)?$/i,rewrite:true},
				{pattern:/\.mp4(?:\?.*)?$/i,rewrite:true},
				{pattern:/\.aac(?:\?.*)?$/i,rewrite:true},
				{pattern:/\/segment\/|\/chunk\//i,rewrite:true}
			],
			preserveQueryParams:true,
			skipDataUrls:true,
			...config
		};
	}

	/**
	 * 重写M3U8内容 - 主重写方法
	 * @param {string} content - 原始M3U8内容
	 * @param {string} originalUrl - 原始URL
	 * @returns {Promise<string>} 重写后的内容
	 */
	async rewrite(content,originalUrl){
		try{
			const parsed=M3U8Parser.parse(content,originalUrl);
			if(!parsed.isValid)return this.fallbackRewrite(content,originalUrl);
			const lines=content.split('\n');
			const rewritten=[];
			let currentVariant=false;
			for(let i=0;i<lines.length;i++){
				let line=lines[i];
				const trimmed=line.trim();
				if(!trimmed){
					rewritten.push(line);
					continue;
				}
				if(trimmed.startsWith('#EXT-X-STREAM-INF:')){
					currentVariant=true;
				}
				if(trimmed.startsWith('#EXT-X-KEY:')){
					line=this.rewriteKey(line,originalUrl);
				}else if(trimmed.startsWith('#EXT-X-MAP:')){
					line=this.rewriteMap(line,originalUrl);
				}else if(!trimmed.startsWith('#')&&trimmed){
					if(currentVariant||this.shouldRewrite(trimmed,originalUrl)){
						line=this.rewriteUri(trimmed,originalUrl);
					}
					currentVariant=false;
				}
				rewritten.push(line);
			}
			return rewritten.join('\n');
		}catch(e){
			console.warn(`M3U8重写失败:${e.message}`);
			return this.fallbackRewrite(content,originalUrl);
		}
	}

	/**
	 * 重写密钥行 - 处理加密URI
	 */
	rewriteKey(line,baseUrl){
		return line.replace(/URI="([^"]+)"/g,(match,uri)=>{
			if(this.config.skipDataUrls&&uri.startsWith('data:'))return match;
			const resolved=M3U8Parser.resolveUrl(uri,baseUrl);
			return`URI="${this.createProxiedUrl(resolved)}"`;
		});
	}

	/**
	 * 重写MAP行 - 处理初始化片段
	 */
	rewriteMap(line,baseUrl){
		return this.rewriteKey(line,baseUrl);//复用密钥重写逻辑
	}

	/**
	 * 重写URI - 处理普通资源URL
	 */
	rewriteUri(uri,baseUrl){
		if(this.config.skipDataUrls&&uri.startsWith('data:'))return uri;
		if(!this.shouldRewrite(uri,baseUrl))return uri;
		const resolved=M3U8Parser.resolveUrl(uri,baseUrl);
		return this.createProxiedUrl(resolved);
	}

	/**
	 * 判断是否需要重写 - 基于配置模式
	 */
	shouldRewrite(uri,baseUrl){
		if(!uri)return false;
		const resolved=M3U8Parser.resolveUrl(uri,baseUrl);
		for(const{pattern,rewrite}of this.config.rewritePatterns){
			if(pattern.test(resolved))return rewrite;
		}
		return false;
	}

	/**
	 * 创建代理URL - 构建代理请求路径
	 */
	createProxiedUrl(originalUrl){
		try{
			const url=new URL(originalUrl);
			let target=this.config.preserveQueryParams?url.href:url.origin+url.pathname;
			return`/o?u=${encodeURIComponent(target)}`;
		}catch{
			return`/o?u=${encodeURIComponent(originalUrl)}`;
		}
	}

	/**
	 * 回退重写 - 当解析失败时使用正则匹配
	 */
	fallbackRewrite(content,baseUrl){
		const patterns=[
			/(https?:\/\/[^\s"']+\.(?:ts|m3u8|key|mp4|aac)(?:\?[^\s"']*)?)/gi,
			/URI="([^"]+)"/gi
		];
		let result=content;
		for(const pattern of patterns){
			result=result.replace(pattern,(match,uri)=>{
				if(!uri||uri.startsWith('data:'))return match;
				if(this.shouldRewrite(uri,baseUrl)){
					const resolved=M3U8Parser.resolveUrl(uri,baseUrl);
					return match.replace(uri,this.createProxiedUrl(resolved));
				}
				return match;
			});
		}
		return result;
	}

	/**
	 * 检查是否为M3U8内容 - 基于Content-Type和内容签名
	 * @param {string} content - 响应内容
	 * @param {Headers} headers - 响应头
	 * @returns {boolean} 是否为M3U8
	 */
	isM3U8Content(content,headers){
		if(!content||typeof content!=='string')return false;
		const contentType=headers?.get('content-type')||'';
		const isHLS=contentType.includes('mpegurl')||headers?.get('content-disposition')?.includes('.m3u8');
		const hasSignature=content.trim().startsWith('#EXTM3U');
		return isHLS||hasSignature;
	}
}