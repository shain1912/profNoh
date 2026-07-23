const ADMIN_FLAG = 'axedu_admin_ok';
const ADMIN_PASSWORD = '147147';

// sessionStorage: 새 탭/브라우저 재시작마다 다시 인증하되, 같은 탭에서 새로고침해도 유지됨.
export function isAdminUnlocked(): boolean {
  return sessionStorage.getItem(ADMIN_FLAG) === '1';
}

export function tryUnlockAdmin(password: string): boolean {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(ADMIN_FLAG, '1');
    return true;
  }
  return false;
}
