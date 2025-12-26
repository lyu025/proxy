export const metadata={
	title:'视频代理服务-中间件版',
	description:'使用 Next.js 中间件实现的视频代理和 M3U8 处理服务'
};

export default function RootLayout({children}){
	return(
		<html lang="zh-CN">
			<head>
				<meta charSet="utf-8"/>
				<meta name="viewport"content="width=device-width,initial-scale=1"/>
				<style>{`
					*{margin:0;padding:0;box-sizing:border-box;}
					body{
						font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
						background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
						min-height:100vh;
					}
				`}</style>
			</head>
			<body>
				<div style={{maxWidth:'1200px',margin:'0 auto',padding:'20px'}}>
					{children}
				</div>
			</body>
		</html>
	);
}