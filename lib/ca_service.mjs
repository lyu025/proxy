/**
 * CA证书服务模块
 * 管理自定义证书的加载和TLS配置
 */
import fs from'fs';
import path from'path';
import{fileURLToPath}from'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));

export class CAService{
	static #caStore=null;
	static #certificatesLoaded=false;

	/**
	 * 加载自定义CA证书 - 支持.pem/.crt/.cer格式
	 * @returns {string|null} 合并后的证书内容
	 */
	static loadCustomCAs(){
		try{
			const certDir=path.join(__dirname,'../cs');
			if(!fs.existsSync(certDir)){
				fs.mkdirSync(certDir,{recursive:true});
				console.log(`证书目录创建:${certDir}`);
				return null;
			}
			const certFiles=fs.readdirSync(certDir).filter(f=>/\.(pem|crt|cer)$/i.test(f));
			if(certFiles.length===0){
				console.log('证书目录为空,使用默认TLS配置');
				return null;
			}
			console.log(`发现证书文件:${certFiles.length}个`);
			const certs=certFiles.map(f=>{
				try{
					return fs.readFileSync(path.join(certDir,f),'utf8');
				}catch{console.warn(`证书读取失败: ${f}`);return null}
			}).filter(Boolean);
			if(certs.length===0)return null;
			this.#caStore=certs.join('\n');
			this.#certificatesLoaded=true;
			const combinedPath=path.join(certDir,'combined.pem');
			fs.writeFileSync(combinedPath,this.#caStore);
			process.env.NODE_EXTRA_CA_CERTS=combinedPath;
			console.log(`证书加载完成: ${certs.length}个证书已合并`);
			return this.#caStore;
		}catch(e){
			console.error(`证书加载错误: ${e.message}`);
			return null;
		}
	}

	/**
	 * 获取CA证书存储
	 * @returns {string|null} 证书内容
	 */
	static getCAStore(){return this.#caStore}

	/**
	 * 检查证书是否已加载
	 * @returns {boolean} 加载状态
	 */
	static hasCertificatesLoaded(){return this.#certificatesLoaded}

	/**
	 * 创建TLS配置选项
	 * @returns {Object} TLS配置对象
	 */
	static createTLSOptions(){
		if(this.#caStore)return{ca:this.#caStore,rejectUnauthorized:true};
		if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')return{rejectUnauthorized:false};
		return{};
	}
}