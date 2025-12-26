export const metadata={
	title:'视频代理服务',
	description:'支持 M3U8 处理的网络代理'
};

export default function RootLayout({children}){
	return(
		<html lang="zh-CN">
			<body style={{
				margin:0,
				padding:20,
				fontFamily:'system-ui,-apple-system,sans-serif',
				backgroundColor:'#f5f5f5'
			}}>
				{children}
			</body>
		</html>
	);
}