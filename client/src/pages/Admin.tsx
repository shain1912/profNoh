import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../components/AuthGate';

/** 관리자 대시보드 — super_admin 전용 (회원관리 + 전체 통계) */

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  role: 'super_admin' | 'org_admin' | 'teacher';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface Stats {
  userCount: number;
  deckCount: number;
  signups7d: number;
  recentUsers: { id: string; email: string; name: string | null; role: string; created_at: string }[];
}

const ROLE_LABEL: Record<string, string> = { super_admin: '최고관리자', org_admin: '기관관리자', teacher: '강사' };
const PAGE_SIZE = 20;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { message?: string })?.message ?? `요청 실패 (${r.status})`);
  return data as T;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function Admin() {
  const { user } = useUser();

  if (user.role !== 'super_admin') {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center p-6 text-center animate-fade-in">
        <div className="text-4xl mb-3">🚫</div>
        <h1 className="text-2xl font-extrabold">접근 권한이 없어요</h1>
        <p className="mt-2 text-sm text-white/50">
          이 페이지는 최고관리자(super_admin) 전용입니다.
          <br />
          권한이 필요하면 관리자에게 문의해 주세요.
        </p>
        <Link to="/build" className="btn-primary mt-6 py-2.5">내 강의로 돌아가기</Link>
      </div>
    );
  }
  return <AdminDashboard meId={user.id} />;
}

function AdminDashboard({ meId }: { meId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // 실제 적용된 검색어
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 처리 중인 사용자 id

  const loadStats = useCallback(() => {
    api<Stats>('/api/admin/stats').then(setStats).catch((e) => setErr(e.message));
  }, []);

  const loadUsers = useCallback((p: number, q: string) => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (q) params.set('search', q);
    api<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params}`)
      .then((d) => { setUsers(d.users); setTotal(d.total); setErr(''); })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadUsers(page, query); }, [page, query, loadUsers]);

  const patchUser = async (id: string, path: 'role' | 'active', body: object) => {
    setBusy(id);
    try {
      const { user: updated } = await api<{ user: AdminUser }>(`/api/admin/users/${id}/${path}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl p-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">🛠️ 관리자 대시보드</h1>
        <Link to="/build" className="text-sm text-white/50 hover:text-white/80">← 내 강의</Link>
      </div>

      {err && <p className="mt-4 rounded-lg bg-down/20 px-3 py-2 text-sm text-down">{err}</p>}

      {/* 통계 카드 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon="👥" label="전체 회원" value={stats?.userCount} />
        <StatCard icon="🗂️" label="전체 덱" value={stats?.deckCount} />
        <StatCard icon="✨" label="최근 7일 가입" value={stats?.signups7d} />
      </div>

      {/* 최근 가입 */}
      {stats && stats.recentUsers.length > 0 && (
        <div className="card mt-4 p-4">
          <h2 className="text-sm font-bold text-white/60">최근 가입</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {stats.recentUsers.map((u) => (
              <li key={u.id} className="flex justify-between gap-2">
                <span className="truncate">{u.name ?? u.email}</span>
                <span className="shrink-0 text-white/40">{fmtDate(u.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 회원 테이블 */}
      <div className="card mt-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">회원 관리 <span className="text-sm font-normal text-white/40">({total}명)</span></h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          >
            <input
              className="input w-56"
              placeholder="이메일/이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn-ghost px-3">검색</button>
          </form>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="py-2 pr-3 font-normal">이메일</th>
                <th className="py-2 pr-3 font-normal">이름</th>
                <th className="py-2 pr-3 font-normal">가입일</th>
                <th className="py-2 pr-3 font-normal">최근 로그인</th>
                <th className="py-2 pr-3 font-normal">역할</th>
                <th className="py-2 font-normal">상태</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-white/5 ${u.is_active === false ? 'opacity-50' : ''}`}>
                  <td className="py-2 pr-3">
                    <span className="truncate">{u.email}</span>
                    {u.id === meId && <span className="ml-1 text-xs text-brand">(나)</span>}
                  </td>
                  <td className="py-2 pr-3">{u.name ?? '—'}</td>
                  <td className="py-2 pr-3 text-white/50">{fmtDate(u.created_at)}</td>
                  <td className="py-2 pr-3 text-white/50">{fmtDate(u.last_login_at)}</td>
                  <td className="py-2 pr-3">
                    <select
                      className="input py-1 text-sm"
                      value={u.role}
                      disabled={busy === u.id || u.id === meId}
                      onChange={(e) => patchUser(u.id, 'role', { role: e.target.value })}
                    >
                      {Object.entries(ROLE_LABEL).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      className={`btn px-3 py-1 text-xs ${u.is_active === false ? 'bg-white/10' : 'bg-up/20 text-up'}`}
                      disabled={busy === u.id || u.id === meId}
                      onClick={() => patchUser(u.id, 'active', { isActive: u.is_active === false })}
                      title={u.id === meId ? '자기 자신은 비활성화할 수 없어요' : ''}
                    >
                      {u.is_active === false ? '비활성 → 켜기' : '활성'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-white/40">검색 결과가 없어요</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button className="btn-ghost px-3 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>
            <span className="text-white/50">{page} / {totalPages}</span>
            <button className="btn-ghost px-3 py-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>다음</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number | undefined }) {
  return (
    <div className="card p-4">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-3xl font-extrabold">{value ?? '…'}</div>
      <div className="text-sm text-white/50">{label}</div>
    </div>
  );
}
