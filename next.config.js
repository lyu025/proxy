/** @type {import('next').NextConfig} */
const nextConfig={
	experimental:{
		serverComponentsExternalPackages:['m3u8-parser']
	},
	async rewrites(){
		return[
			{
				source:'/p/:path*',
				destination:'/api/proxy/:path*'
			},
			{
				source:'/m/:path*',
				destination:'/api/m3u8/:path*'
			}
		];
	},
	async headers(){
		return[
			{
				source:'/:path*',headers:[
					{key:'Access-Control-Allow-Origin',value:'*'},
					{key:'Access-Control-Allow-Methods',value:'GET, POST, OPTIONS'},
					{key:'Access-Control-Allow-Headers',value:'Content-Type, Authorization'}
				]
			}
		];
	}
};
module.exports=nextConfig;