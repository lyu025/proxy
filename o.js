const express=require('express')
const https=require('https')
const http=require('http')
const cors=require('cors')
const{URL}=require('url')

const app=express()
app.use(cors())

const mimeMap={
	'.m3u8':'application/vnd.apple.mpegurl',
	'.ts':'video/MP2T',
	'.mp4':'video/mp4',
	'.webm':'video/webm',
	'.m4s':'video/iso.segment',
	'.m4a':'audio/mp4',
	'.mp3':'audio/mpeg',
	'.jpg':'image/jpeg',
	'.png':'image/png',
	'.gif':'image/gif',
	'.js':'application/javascript',
	'.css':'text/css',
	'.html':'text/html',
	'.json':'application/json'
}

const cc=u=>u.startsWith('https')?https:http

app.options('/',(req,res)=>{
	res.set({
		'Access-Control-Allow-Origin':'*',
		'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS',
		'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Requested-With',
		'Access-Control-Max-Age':'86400'
	})
	res.status(204).end()
})

app.all('/',async(req,res)=>{
	//立即设置CORS响应头
	res.set({
		'Access-Control-Allow-Origin':'*',
		'Access-Control-Expose-Headers':'*',
		'Access-Control-Allow-Credentials':'true',
	})
	
	const u=req.query.u
	if(!u)return res.status(400).send('Missing url')
	
	try{
		const urlObj=new URL(u)
		const pathname=urlObj.pathname.toLowerCase()
		const isM3U8=pathname.endsWith('.m3u8')
		const ext=pathname.match(/\.[a-z0-9]+$/)?.[0]||''
		const mime=mimeMap[ext]||'application/octet-stream'
		
		const options={
			method:req.method,
			headers:{
				...req.headers,
				host:urlObj.host,
				//移除可能引起CORS问题的头
				origin:undefined,
				referer:undefined
			}
		}
		
		//删除代理自身的头
		delete options.headers['x-forwarded-for']
		delete options.headers['x-forwarded-proto']
		delete options.headers['x-forwarded-port']
		
		if(['POST','PUT','PATCH'].includes(req.method)&&req.body){
			const contentType=req.headers['content-type']||'application/json'
			options.headers['content-type']=contentType
			
			let bodyData
			if(contentType.includes('application/x-www-form-urlencoded')){
				bodyData=Object.keys(req.body).map(key=>
					`${encodeURIComponent(key)}=${encodeURIComponent(req.body[key])}`
				).join('&')
			}else if(contentType.includes('multipart/form-data')){
				//对于form-data，保持原样传递
				bodyData=req.body
			}else{
				bodyData=JSON.stringify(req.body)
			}
			
			if(typeof bodyData==='string'){
				options.headers['content-length']=Buffer.byteLength(bodyData)
			}
		}
		
		const proxyReq=cc(u).request(u,options,proxyRes=>{
			//复制响应头但过滤掉可能引起CORS问题的头
			const headers={...proxyRes.headers}
			delete headers['access-control-allow-origin']
			delete headers['access-control-allow-methods']
			delete headers['access-control-allow-headers']
			
			res.set(headers)
			
			if(isM3U8){
				let data=''
				proxyRes.on('data',chunk=>data+=chunk)
				proxyRes.on('end',()=>{
					const base=`${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/[^/]+$/,'')}`
					const processed=data.split('\n').map(line=>{
						line=line.trim()
						if(!line||line.startsWith('#')||line.includes('://'))return line
						const fullUrl=line.startsWith('/')
							?`${urlObj.protocol}//${urlObj.host}${line}`
							:`${base}${line}`
						return `/?u=${encodeURIComponent(fullUrl)}`
					}).join('\n')
					
					res.set({
						'Content-Type':mime,
						'Cache-Control':'no-cache'
					})
					res.send(processed)
				})
			}else{
				const isVideo=Object.keys(mimeMap).slice(0,6).includes(ext)
				res.set({
					'Content-Type':mime,
					'Cache-Control':isVideo?'public, max-age=3600':'no-cache',
					'Accept-Ranges':['.ts','.m4s'].includes(ext)?'none':'bytes'
				})
				
				proxyRes.pipe(res)
			}
		})
		
		proxyReq.on('error',err=>{
			console.error('Proxy error:',err.message)
			res.status(500).json({error:'Proxy error',message:err.message})
		})
		
		//处理请求体
		if(['POST','PUT','PATCH'].includes(req.method)&&req.body){
			if(typeof bodyData==='string'){
				proxyReq.write(bodyData)
			}else if(req.rawBody){
				//如果有原始body数据（如form-data）
				proxyReq.write(req.rawBody)
			}
		}else if(req.method!=='GET'&&req.method!=='HEAD'&&req.method!=='OPTIONS'){
			//其他方法可能有body
			req.pipe(proxyReq)
			return
		}
		
		proxyReq.end()
	}catch(err){
		console.error('URL parse error:',err.message)
		res.status(500).json({error:'Invalid URL',message:err.message})
	}
})

//处理原始body以支持form-data
app.use('/',(req,res,next)=>{
	if(req.headers['content-type']&&req.headers['content-type'].includes('multipart/form-data')){
		let data=[]
		req.on('data',chunk=>data.push(chunk))
		req.on('end',()=>{
			req.rawBody=Buffer.concat(data)
			next()
		})
	}else{
		next()
	}
})

const PORT=process.env.PORT||4000
app.listen(PORT,()=>{
	console.log(`CORS Proxy:/?u=<target_url>`)
	console.log(`Supports:GET,POST,PUT,PATCH,DELETE,OPTIONS`)
	console.log(`CORS enabled for all origins`)
})