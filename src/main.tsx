import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import faIR from 'antd/locale/fa_IR';
import '@ant-design/v5-patch-for-react-19';
import App from './App';
import { recoverPreloadError } from './preloadRecovery';
import 'antd/dist/reset.css';
import './styles.css';

window.addEventListener('vite:preloadError', event => {
  try {
    recoverPreloadError(event, window.sessionStorage, () => window.location.reload());
  } catch {
    // The boundary remains visible if recovery cannot use browser storage.
  }
});

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="system-state-page" dir="rtl">
      <section className="system-state-card" role="alert">
        <img src="/momo-app-icon.png" alt="لوگوی گاو" width="48" height="48" />
        <h1>صفحه بارگذاری نشد</h1>
        <p>برنامه هنگام باز شدن به خطا خورد. صفحه را دوباره بارگذاری کن.</p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>بارگذاری دوباره</button>
      </section>
    </main>;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary><ConfigProvider
      direction="rtl"
      locale={faIR}
      theme={{
        token: {
          colorPrimary: '#DF7899',
          colorText: '#171717',
          colorTextSecondary: '#707070',
          colorBgLayout: '#FFFFFF',
          colorBorder: '#E8E8E8',
          colorBgContainer: '#FFFFFF',
          borderRadius: 14,
          fontFamily: "'Estedad', Tahoma, sans-serif",
        },
        components: {
          Button: { controlHeight: 44, fontWeight: 700 },
          Input: { controlHeight: 46 },
          Segmented: { itemSelectedBg: '#171717', itemSelectedColor: '#ffffff' },
        },
      }}
    >
      <App />
    </ConfigProvider></AppErrorBoundary>
  </React.StrictMode>,
);
