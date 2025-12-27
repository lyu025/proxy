/**
 * M3U8解析器模块
 * 完整解析HLS播放列表规范
 */

export class M3U8Parser{
	/**
	 * 解析相对URL - 转换为绝对URL
	 * 注意：这个方法必须公开，因为被重写器调用
	 * @param {string} uri - 相对URI
	 * @param {string} baseUrl - 基础URL
	 * @returns {string} 解析后的绝对URL
	 */
	static resolveUrl(uri,baseUrl){
		if(!uri)return uri;
		if(uri.startsWith('http')||uri.startsWith('data:'))return uri;
		if(!baseUrl)return uri;
		try{
			const base=new URL(baseUrl);
			if(uri.startsWith('//'))return base.protocol+uri;
			if(uri.startsWith('/'))return base.origin+uri;
			const basePath=base.pathname.slice(0,base.pathname.lastIndexOf('/')+1);
			return new URL(uri,base.origin+basePath).href;
		}catch{return uri;}
	}

	/**
	 * 解析M3U8内容 - 支持主播放列表和媒体播放列表
	 * @param {string} content - M3U8文本内容
	 * @param {string} baseUrl - 用于解析相对路径的基础URL
	 * @returns {Object} 结构化解析结果
	 */
	static parse(content,baseUrl){
		const result={
			isValid:false,
			type:'media',
			version:1,
			targetDuration:0,
			mediaSequence:0,
			discontinuitySequence:0,
			playlistType:null,
			endList:false,
			iFramesOnly:false,
			independentSegments:false,
			segments:[],
			variantStreams:[],
			mediaGroups:[],
			keys:new Map(),
			maps:new Map(),
			baseUrl
		};
		let currentKey=null;
		let currentMap=null;
		let currentSegment=null;
		let currentVariant=null;
		const lines=content.split('\n');
		for(let i=0;i<lines.length;i++){
			const line=lines[i].trim();
			if(!line)continue;
			if(line==='#EXTM3U'){
				result.isValid=true;
				continue;
			}
			if(line.startsWith('#EXT-X-VERSION:')){
				result.version=parseInt(line.slice(15),10);
				continue;
			}
			if(line.startsWith('#EXT-X-TARGETDURATION:')){
				result.targetDuration=parseInt(line.slice(22),10);
				continue;
			}
			if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:')){
				result.mediaSequence=parseInt(line.slice(22),10);
				continue;
			}
			if(line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')){
				result.discontinuitySequence=parseInt(line.slice(31),10);
				continue;
			}
			if(line.startsWith('#EXT-X-PLAYLIST-TYPE:')){
				result.playlistType=line.slice(21);
				continue;
			}
			if(line.startsWith('#EXT-X-KEY:')){
				currentKey=this.parseKey(line,baseUrl);
				if(currentKey.uri)result.keys.set(currentKey.uri,currentKey);
				continue;
			}
			if(line.startsWith('#EXT-X-MAP:')){
				currentMap=this.parseMap(line,baseUrl);
				if(currentMap.uri)result.maps.set(currentMap.uri,currentMap);
				continue;
			}
			if(line.startsWith('#EXT-X-STREAM-INF:')){
				currentVariant=this.parseVariantStream(line);
				result.type='master';
				continue;
			}
			if(line.startsWith('#EXT-X-MEDIA:')){
				result.mediaGroups.push(this.parseMedia(line));
				continue;
			}
			if(line.startsWith('#EXTINF:')){
				currentSegment=this.parseSegmentInfo(line);
				continue;
			}
			if(line.startsWith('#EXT-X-BYTERANGE:')){
				if(currentSegment)currentSegment.byteRange=line.slice(17);
				continue;
			}
			if(line==='#EXT-X-DISCONTINUITY'){
				if(currentSegment)currentSegment.discontinuity=true;
				continue;
			}
			if(line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')){
				if(currentSegment)currentSegment.programDateTime=line.slice(25);
				continue;
			}
			if(line==='#EXT-X-ENDLIST'){
				result.endList=true;
				continue;
			}
			if(line==='#EXT-X-I-FRAMES-ONLY'){
				result.iFramesOnly=true;
				continue;
			}
			if(line==='#EXT-X-INDEPENDENT-SEGMENTS'){
				result.independentSegments=true;
				continue;
			}
			if(!line.startsWith('#')){
				const resolvedUri=this.resolveUrl(line,baseUrl);
				if(currentVariant){
					currentVariant.uri=resolvedUri;
					result.variantStreams.push(currentVariant);
					currentVariant=null;
				}else if(currentSegment){
					currentSegment.uri=resolvedUri;
					currentSegment.key=currentKey;
					currentSegment.map=currentMap;
					result.segments.push(currentSegment);
					currentSegment=null;
				}else if(resolvedUri.endsWith('.m3u8')){
					result.type='master';
					result.variantStreams.push({
						uri:resolvedUri,
						bandwidth:0,
						resolution:null,
						codecs:null
					});
				}
			}
		}
		return result;
	}

	/**
	 * 解析加密密钥 - 处理AES-128/AES-256/SAMPLE-AES加密
	 */
	static parseKey(line,baseUrl){
		const key={method:'NONE',uri:null,iv:null,keyFormat:null,keyFormatVersions:null};
		const params=line.slice(11).split(',');
		for(const param of params){
			const[keyName,value]=param.split('=');
			if(!keyName||!value)continue;
			const cleanValue=value.replace(/"/g,'');
			switch(keyName.trim()){
				case'METHOD':key.method=cleanValue;break;
				case'URI':key.uri=this.resolveUrl(cleanValue,baseUrl);break;
				case'IV':key.iv=cleanValue;break;
				case'KEYFORMAT':key.keyFormat=cleanValue;break;
				case'KEYFORMATVERSIONS':key.keyFormatVersions=cleanValue;break;
			}
		}
		return key;
	}

	/**
	 * 解析初始化片段 - 用于分片MP4格式
	 */
	static parseMap(line,baseUrl){
		const map={uri:null,byteRange:null};
		const params=line.slice(11).split(',');
		for(const param of params){
			const[keyName,value]=param.split('=');
			if(!keyName||!value)continue;
			const cleanValue=value.replace(/"/g,'');
			if(keyName.trim()==='URI')map.uri=this.resolveUrl(cleanValue,baseUrl);
			else if(keyName.trim()==='BYTERANGE')map.byteRange=cleanValue;
		}
		return map;
	}

	/**
	 * 解析变体流信息 - 用于多码率自适应流
	 */
	static parseVariantStream(line){
		const stream={bandwidth:0,resolution:null,codecs:null,uri:null};
		const params=line.slice(18).split(',');
		for(const param of params){
			const[keyName,value]=param.split('=');
			if(!keyName||!value)continue;
			const cleanValue=value.replace(/"/g,'');
			const key=keyName.trim();
			if(key==='BANDWIDTH')stream.bandwidth=parseInt(cleanValue,10);
			else if(key==='RESOLUTION')stream.resolution=cleanValue;
			else if(key==='CODECS')stream.codecs=cleanValue;
		}
		return stream;
	}

	/**
	 * 解析媒体信息 - 处理音轨/字幕/字幕轨道
	 */
	static parseMedia(line){
		const media={type:null,groupId:null,language:null,name:null,default:false,uri:null};
		const params=line.slice(12).split(',');
		for(const param of params){
			const[keyName,value]=param.split('=');
			if(!keyName||!value)continue;
			const cleanValue=value.replace(/"/g,'');
			const key=keyName.trim();
			if(key==='TYPE')media.type=cleanValue;
			else if(key==='GROUP-ID')media.groupId=cleanValue;
			else if(key==='LANGUAGE')media.language=cleanValue;
			else if(key==='NAME')media.name=cleanValue;
			else if(key==='DEFAULT')media.default=cleanValue==='YES';
			else if(key==='URI')media.uri=cleanValue;
		}
		return media;
	}

	/**
	 * 解析片段信息 - 包含时长和标题
	 */
	static parseSegmentInfo(line){
		const segment={duration:0,title:null,uri:null};
		const parts=line.slice(8).split(',');
		if(parts.length>=1)segment.duration=parseFloat(parts[0]);
		if(parts.length>=2)segment.title=parts.slice(1).join(',').trim();
		return segment;
	}
}