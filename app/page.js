'use client';

import { useState } from 'react';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [useShortPath, setUseShortPath] = useState(true);

  const handleTest = async (type) => {
    if (!url) {
      alert('请输入 URL');
      return;
    }

    setLoading(true);
    try {
      let endpoint;
      
      if (useShortPath) {
        // 使用短路径格式
        const encodedUrl = encodeURIComponent(url);
        endpoint = type === 'm3u8' 
          ? `/m/${encodedUrl}`  // 短路径
          : `/p/${encodedUrl}`;  // 短路径
      } else {
        // 使用传统查询参数格式
        const encodedUrl = encodeURIComponent(url);
        endpoint = type === 'm3u8' 
          ? `/m3u8?url=${encodedUrl}`  // 传统路径
          : `/proxy?url=${encodedUrl}`; // 传统路径
      }
      
      const response = await fetch(endpoint);
      const text = await response.text();
      
      // 显示结果
      const preview = text.substring(0, 500);
      const hasMore = text.length > 500;
      setResult(`${preview}${hasMore ? '...' : ''}`);
      
      // 如果是 M3U8 并且请求成功，提供下载
      if (type === 'm3u8' && response.ok) {
        const blob = new Blob([text], { type: 'application/vnd.apple.mpegurl' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'playlist.m3u8';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        
        alert('M3U8 文件已下载！');
      }
    } catch (error) {
      setResult(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '20px',
      padding: '40px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{
          fontSize: '2.2rem',
          background: 'linear-gradient(90deg, #667eea, #764ba2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '10px'
        }}>
          🔗 短路径视频代理服务
        </h1>
        <p style={{ color: '#666', fontSize: '1rem' }}>
          /p/ 代理文件 | /m/ 处理 M3U8
        </p>
      </header>

      <div style={{ marginBottom: '25px' }}>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="输入视频 URL 或 M3U8 链接 (支持 http/https)"
            style={{
              width: '100%',
              padding: '12px 15px',
              border: '2px solid #e0e0e0',
              borderRadius: '10px',
              fontSize: '16px',
              outline: 'none',
              transition: 'border-color 0.3s'
            }}
          />
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          flexWrap: 'wrap',
          marginBottom: '15px'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={useShortPath}
              onChange={(e) => setUseShortPath(e.target.checked)}
            />
            使用短路径 (/p/, /m/)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleTest('m3u8')}
            disabled={loading}
            style={{
              padding: '12px 25px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flex: 1,
              minWidth: '200px'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            {loading ? '⏳ 处理中...' : '🎬 处理 M3U8'}
          </button>
          
          <button
            onClick={() => handleTest('proxy')}
            disabled={loading}
            style={{
              padding: '12px 25px',
              backgroundColor: '#764ba2',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flex: 1,
              minWidth: '200px'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            {loading ? '⏳ 代理中...' : '🔗 代理文件'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{
          marginTop: '25px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '10px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <h3 style={{ margin: 0, color: '#333' }}>
              {result.includes('错误') ? '❌ 错误信息' : '📋 处理结果'}
            </h3>
            <button
              onClick={() => setResult('')}
              style={{
                padding: '5px 10px',
                backgroundColor: '#f0f0f0',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              清除
            </button>
          </div>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            color: '#666',
            maxHeight: '250px',
            overflowY: 'auto',
            margin: 0,
            padding: '10px',
            backgroundColor: 'white',
            borderRadius: '5px'
          }}>
            {result}
          </pre>
        </div>
      )}

      <div style={{ marginTop: '35px' }}>
        <h2 style={{ 
          marginBottom: '20px', 
          color: '#333',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '10px'
        }}>
          📚 使用说明
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '15px' }}>
            <h4 style={{ color: '#667eea', marginBottom: '10px' }}>短路径格式</h4>
            <div style={{
              padding: '15px',
              backgroundColor: '#f0f7ff',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>M3U8 处理:</strong>
                <code style={{ 
                  display: 'block', 
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '5px',
                  marginTop: '5px',
                  fontSize: '13px'
                }}>
                  /m/{'{encoded-url}'}
                </code>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <strong>文件代理:</strong>
                <code style={{ 
                  display: 'block', 
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '5px',
                  marginTop: '5px',
                  fontSize: '13px'
                }}>
                  /p/{'{encoded-url}'}
                </code>
              </div>
              
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                marginTop: '15px'
              }}>
                ✅ 更简洁的 URL<br/>
                ✅ 兼容性更好<br/>
                ✅ 易于记忆
              </div>
            </div>
          </div>
          
          <div style={{ padding: '15px' }}>
            <h4 style={{ color: '#764ba2', marginBottom: '10px' }}>传统格式</h4>
            <div style={{
              padding: '15px',
              backgroundColor: '#f8f0ff',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>M3U8 处理:</strong>
                <code style={{ 
                  display: 'block', 
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '5px',
                  marginTop: '5px',
                  fontSize: '13px'
                }}>
                  /m3u8?url={'{url}'}
                </code>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <strong>文件代理:</strong>
                <code style={{ 
                  display: 'block', 
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '5px',
                  marginTop: '5px',
                  fontSize: '13px'
                }}>
                  /proxy?url={'{url}'}
                </code>
              </div>
              
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                marginTop: '15px'
              }}>
                🔄 兼容旧版本<br/>
                🔄 查询参数格式<br/>
                🔄 支持特殊字符
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: '35px', 
        padding: '20px',
        backgroundColor: '#fff8e1',
        borderRadius: '10px',
        border: '1px solid #ffecb3'
      }}>
        <h3 style={{ 
          color: '#e65100', 
          marginBottom: '15px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>⚠️</span> 示例代码
        </h3>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '15px'
        }}>
          <div>
            <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '8px' }}>短路径示例</h4>
            <pre style={{
              backgroundColor: '#1e1e1e',
              color: '#f8f8f8',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              margin: 0
            }}>
{`// JavaScript
const m3u8Url = "https://your-app.vercel.app/m/" + 
  encodeURIComponent("原始M3U8链接");

const videoUrl = "https://your-app.vercel.app/p/" + 
  encodeURIComponent("原始视频链接");

// 直接使用
<video src={videoUrl} controls />`}
            </pre>
          </div>
          
          <div>
            <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '8px' }}>播放器集成</h4>
            <pre style={{
              backgroundColor: '#1e1e1e',
              color: '#f8f8f8',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              margin: 0
            }}>
{`// HLS.js 示例
const url = "原始M3U8链接";
const proxyUrl = "https://your-app.vercel.app/m/" + 
  encodeURIComponent(url);

const video = document.getElementById('video');
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(proxyUrl);
  hls.attachMedia(video);
}`}
            </pre>
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: '30px', 
        textAlign: 'center', 
        color: '#888',
        fontSize: '14px',
        paddingTop: '20px',
        borderTop: '1px solid #e0e0e0'
      }}>
        <p>🚀 基于 Next.js 14 中间件 | 短路径版本 v1.0</p>
      </div>
    </div>
  );
}