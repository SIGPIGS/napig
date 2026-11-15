import { Suspense, lazy, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { Route, Routes } from 'react-router-dom';

import PageBackground from '@/components/page_background';
import PageLoading from '@/components/page_loading';
import Toaster from '@/components/toaster';

import DialogProvider from '@/contexts/dialog';

import { serverRequest } from '@/utils/request';

import store from '@/store';

const IndexPage = lazy(() => import('@/pages/index'));
const QQLoginPage = lazy(() => import('@/pages/qq_login'));
const DashboardIndexPage = lazy(() => import('@/pages/dashboard'));
const AboutPage = lazy(() => import('@/pages/dashboard/about'));
const ConfigPage = lazy(() => import('@/pages/dashboard/config'));
const DebugPage = lazy(() => import('@/pages/dashboard/debug'));
const HttpDebug = lazy(() => import('@/pages/dashboard/debug/http'));
const WSDebug = lazy(() => import('@/pages/dashboard/debug/websocket'));
const FileManagerPage = lazy(() => import('@/pages/dashboard/file_manager'));
const LogsPage = lazy(() => import('@/pages/dashboard/logs'));
const NetworkPage = lazy(() => import('@/pages/dashboard/network'));
const TerminalPage = lazy(() => import('@/pages/dashboard/terminal'));

function App () {
  return (
    <DialogProvider>
      <Provider store={store}>
        <PageBackground />
        <Toaster />
        <Suspense fallback={<PageLoading />}>
          <AuthChecker>
            <AppRoutes />
          </AuthChecker>
        </Suspense>
      </Provider>
    </DialogProvider>
  );
}

function AuthChecker ({ children }: { children: React.ReactNode; }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    serverRequest.get('/auth/session').then(() => setReady(true)).catch(() => setError(true));
  }, []);
  if (error) return <div className='p-8'>无法确认登录状态，请刷新页面重试。</div>;
  return ready ? <>{children}</> : <PageLoading />;
}

function AppRoutes () {
  return (
    <Routes>
      <Route path='/' element={<IndexPage />}>
        <Route index element={<DashboardIndexPage />} />
        <Route path='network' element={<NetworkPage />} />
        <Route path='config' element={<ConfigPage />} />
        <Route path='logs' element={<LogsPage />} />
        <Route path='debug' element={<DebugPage />}>
          <Route path='ws' element={<WSDebug />} />
          <Route path='http' element={<HttpDebug />} />
        </Route>
        <Route path='file_manager' element={<FileManagerPage />} />
        <Route path='terminal' element={<TerminalPage />} />
        <Route path='about' element={<AboutPage />} />
      </Route>
      <Route path='/qq_login' element={<QQLoginPage />} />
    </Routes>
  );
}

export default App;
