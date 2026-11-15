import axios from 'axios';
import { signIn } from './auth';

export const serverRequest = axios.create({ baseURL: '/api', timeout: 30000, headers: { Accept: 'application/json' } });
export const request = axios.create({ timeout: 10000 });

export const requestServerWithFetch = async (url: string, options: RequestInit) => {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch('/api' + url, { ...options, headers, credentials: 'same-origin', redirect: 'error' });
  if (response.status === 401) signIn();
  return response;
};

serverRequest.interceptors.response.use((response) => {
  if (response.headers['content-type'] === 'application/octet-stream') return response;
  if (response.data.code !== 0) throw new Error(response.data.message);
  return response;
}, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) signIn();
  return Promise.reject(error);
});
