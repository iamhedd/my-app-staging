import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import faIR from 'antd/locale/fa_IR';
import '@ant-design/v5-patch-for-react-19';
import App from './App';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
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
    </ConfigProvider>
  </React.StrictMode>,
);
