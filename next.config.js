/**@type{import('next').NextConfig}*/
const nextConfig={
	experimental:{
		serverComponentsExternalPackages:['node-fetch']
	},
	async rewrites(){
		return[
			{
				source:'/proxy/:path*',
				destination:'/api/proxy/:path*'
			},
			{
				source:'/m3u8/:path*',
				destination:'/api/m3u8/:path*'
			}
		];
	}
};

module.exports=nextConfig;