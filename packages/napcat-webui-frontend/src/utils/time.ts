/**
 * 休眠函数
 * @param ms 休眠时间
 * @returns Promise<void>
 */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const formatNumber = (n: number) => n.toString().padStart(2, '0');
/**
 * 将时间戳转换为日期字符串
 * @param timestamp 时间戳
 * @returns string
 * @example timestampToDateString(163383301) => "2021-10-10 10:10:10"
 */
export const timestampToDateString = (timestamp: number) => {
  timestamp = timestamp * 1000;
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return `${year}-${formatNumber(month)}-${formatNumber(day)} ${formatNumber(hour)}:${formatNumber(minute)}:${formatNumber(second)}`;
};
