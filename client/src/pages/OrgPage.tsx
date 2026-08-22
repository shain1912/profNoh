import { useEffect, useState } from 'react';
import { useUser } from '../components/AuthGate';
import {
  type Org,
  type OrgMember,
  type OrgInvite,
  listOrgs,
  createOrg,
  updateOrg,
  deleteOrg,
  listOrgMembersAdmin,
  fetchMyOrg,
  fetchMyOrgMembers,
  saveMyOrgDomains,
  listMyInvites,
  createMyInvite,
  deleteMyInvite,
  joinWithCode,
} from '../lib/orgApi';

/**
 * /org — 기관 관리 페이지 (TASK A의 관리자 틀과 독립된 자체 라우트)
 * - super_admin: 기관 CRUD + 기관별 회원 조회
 * - org_admin: 내 기관 회원 목록 · 화이트리스트 도메인 · 초대코드
 * - teacher: 초대코드 입력으로 기관 합류
 */
export default function OrgPage() {
  const { user } = useUser();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-extrabold">기관 관리 🏫</h1>
      <p className="mt-1 text-sm text-white/50">
        {user.name ?? user.email} · 권한: <b>{user.role}</b>
      </p>

      {user.role === 'super_admin' && <SuperAdminPanel />}
      {user.role !== 'super_admin' && user.orgId && <MyOrgPanel isAdmin={user.role === 'org_admin'} />}
      {user.role !== 'super_admin' && !user.orgId && <JoinPanel />}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="mt-2 rounded-lg bg-down/20 px-3 py-2 text-sm text-down">{msg}</p>;
}

const inputCls =
  'rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40';
const btnCls =
  'rounded-lg bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20 active:scale-[0.98]';
const primaryBtnCls =
  'rounded-lg bg-emerald-500/80 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98]';

// ── teacher: 초대코드 합류 ──

function JoinPanel() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const join = async () => {
    setErr('');
    try {
      await joinWithCode(code);
      location.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="mt-8 max-w-sm">
      <p className="text-sm text-white/60">아직 소속된 기관이 없어요. 기관 관리자에게 받은 초대코드를 입력하세요.</p>
      <div className="mt-3 flex gap-2">
        <input
          className={inputCls + ' flex-1 uppercase'}
          placeholder="초대코드 (예: AB12CD34)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className={primaryBtnCls} onClick={join} disabled={!code.trim()}>
          합류
        </button>
      </div>
      <ErrorLine msg={err} />
    </div>
  );
}

// ── org_admin: 내 기관 ──

function MyOrgPanel({ isAdmin }: { isAdmin: boolean }) {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [domainsText, setDomainsText] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const o = await fetchMyOrg();
      setOrg(o);
      setDomainsText(o.allowed_domains.join(', '));
      setMembers(await fetchMyOrgMembers());
      setInvites(await listMyInvites());
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  if (!isAdmin)
    return <p className="mt-8 text-sm text-white/60">기관에 소속되어 있어요. 기관 관리는 기관 관리자(org_admin)만 할 수 있습니다.</p>;
  if (!org) return <ErrorLine msg={err} />;

  const saveDomains = async () => {
    setErr('');
    setSaved(false);
    try {
      const o = await saveMyOrgDomains(domainsText.split(/[,\s]+/).filter(Boolean));
      setOrg(o);
      setDomainsText(o.allowed_domains.join(', '));
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const issueInvite = async (role: 'teacher' | 'org_admin') => {
    setErr('');
    try {
      await createMyInvite({ role, expiresInDays: 30 });
      setInvites(await listMyInvites());
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-lg font-bold">
          {org.name} <span className="ml-1 rounded bg-white/10 px-2 py-0.5 text-xs">{org.org_type}</span>
        </h2>
        <p className="mt-1 text-xs text-white/40">
          좌석 {org.seat_limit ?? '무제한'} · 계약 {org.contract_start ?? '—'} ~ {org.contract_end ?? '—'}
        </p>
      </section>

      <section>
        <h3 className="font-bold">화이트리스트 도메인 ✉️</h3>
        <p className="mt-1 text-xs text-white/40">이 도메인 이메일로 가입하면 자동으로 우리 기관 소속이 됩니다. 쉼표로 구분.</p>
        <div className="mt-2 flex gap-2">
          <input
            className={inputCls + ' flex-1'}
            placeholder="예: sen.go.kr, school.ac.kr"
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
          />
          <button className={primaryBtnCls} onClick={saveDomains}>
            저장
          </button>
        </div>
        {saved && <p className="mt-1 text-xs text-emerald-400">저장됨 ✓</p>}
      </section>

      <section>
        <h3 className="font-bold">초대코드 🎟️</h3>
        <div className="mt-2 flex gap-2">
          <button className={btnCls} onClick={() => issueInvite('teacher')}>
            ＋ 강사 초대코드
          </button>
          <button className={btnCls} onClick={() => issueInvite('org_admin')}>
            ＋ 관리자 초대코드
          </button>
        </div>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-white/40">
            <tr>
              <th className="py-1">코드</th>
              <th>권한</th>
              <th>사용</th>
              <th>만료</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invites.map((iv) => (
              <tr key={iv.id} className="border-t border-white/10">
                <td className="py-2 font-mono font-bold tracking-widest">{iv.code}</td>
                <td>{iv.role}</td>
                <td>
                  {iv.used_count}
                  {iv.max_uses ? `/${iv.max_uses}` : ''}
                </td>
                <td className="text-xs text-white/40">{iv.expires_at ? iv.expires_at.slice(0, 10) : '없음'}</td>
                <td className="text-right">
                  <button
                    className="text-xs text-white/40 hover:text-down"
                    onClick={async () => {
                      await deleteMyInvite(iv.id);
                      setInvites(await listMyInvites());
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-white/30">
                  발급된 초대코드가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-bold">회원 목록 👥 ({members.length}명)</h3>
        <MemberTable members={members} />
      </section>

      <ErrorLine msg={err} />
    </div>
  );
}

function MemberTable({ members }: { members: OrgMember[] }) {
  return (
    <table className="mt-3 w-full text-left text-sm">
      <thead className="text-xs text-white/40">
        <tr>
          <th className="py-1">이메일</th>
          <th>이름</th>
          <th>권한</th>
          <th>가입 방식</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id} className="border-t border-white/10">
            <td className="py-2">{m.email}</td>
            <td>{m.name ?? '—'}</td>
            <td>{m.role}</td>
            <td className="text-xs text-white/40">{m.provider}</td>
          </tr>
        ))}
        {members.length === 0 && (
          <tr>
            <td colSpan={4} className="py-3 text-center text-white/30">
              회원이 없어요.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ── super_admin: org CRUD ──

const emptyForm = { name: '', orgType: '학교', domains: '', seatLimit: '', contractStart: '', contractEnd: '' };

function SuperAdminPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, OrgMember[]>>({});
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      setOrgs(await listOrgs());
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr('');
    const body = {
      name: form.name,
      orgType: form.orgType,
      allowedDomains: form.domains.split(/[,\s]+/).filter(Boolean),
      seatLimit: form.seatLimit ? Number(form.seatLimit) : null,
      contractStart: form.contractStart || null,
      contractEnd: form.contractEnd || null,
    };
    try {
      if (editingId) await updateOrg(editingId, body);
      else await createOrg(body);
      setForm({ ...emptyForm });
      setEditingId(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const startEdit = (o: Org) => {
    setEditingId(o.id);
    setForm({
      name: o.name,
      orgType: o.org_type,
      domains: o.allowed_domains.join(', '),
      seatLimit: o.seat_limit?.toString() ?? '',
      contractStart: o.contract_start ?? '',
      contractEnd: o.contract_end ?? '',
    });
  };

  const toggleMembers = async (id: string) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!membersByOrg[id]) {
      try {
        const r = await listOrgMembersAdmin(id);
        setMembersByOrg((m) => ({ ...m, [id]: r.members }));
      } catch (e) {
        setErr((e as Error).message);
      }
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section className="rounded-xl border border-white/10 p-4">
        <h3 className="font-bold">{editingId ? '기관 수정 ✏️' : '새 기관 등록 ➕'}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <input className={inputCls} placeholder="기관명" value={form.name} onChange={set('name')} />
          <select className={inputCls} value={form.orgType} onChange={set('orgType')}>
            <option value="교육청">교육청</option>
            <option value="학교">학교</option>
            <option value="기업">기업</option>
          </select>
          <input className={inputCls} placeholder="도메인 (쉼표 구분)" value={form.domains} onChange={set('domains')} />
          <input className={inputCls} type="number" placeholder="좌석 수 (빈칸=무제한)" value={form.seatLimit} onChange={set('seatLimit')} />
          <input className={inputCls} type="date" title="계약 시작" value={form.contractStart} onChange={set('contractStart')} />
          <input className={inputCls} type="date" title="계약 종료" value={form.contractEnd} onChange={set('contractEnd')} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className={primaryBtnCls} onClick={submit} disabled={!form.name.trim()}>
            {editingId ? '수정 저장' : '등록'}
          </button>
          {editingId && (
            <button
              className={btnCls}
              onClick={() => {
                setEditingId(null);
                setForm({ ...emptyForm });
              }}
            >
              취소
            </button>
          )}
        </div>
      </section>

      <section>
        <h3 className="font-bold">기관 목록 ({orgs.length})</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-white/40">
            <tr>
              <th className="py-1">기관명</th>
              <th>유형</th>
              <th>도메인</th>
              <th>좌석</th>
              <th>계약</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <>
                <tr key={o.id} className="border-t border-white/10">
                  <td className="py-2 font-bold">{o.name}</td>
                  <td>{o.org_type}</td>
                  <td className="text-xs">{o.allowed_domains.join(', ') || '—'}</td>
                  <td>{o.seat_limit ?? '∞'}</td>
                  <td className="text-xs text-white/40">
                    {o.contract_start ?? '—'} ~ {o.contract_end ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-right text-xs">
                    <button className="mr-2 text-white/50 hover:text-white" onClick={() => toggleMembers(o.id)}>
                      회원
                    </button>
                    <button className="mr-2 text-white/50 hover:text-white" onClick={() => startEdit(o)}>
                      수정
                    </button>
                    <button
                      className="text-white/40 hover:text-down"
                      onClick={async () => {
                        if (!confirm(`'${o.name}' 기관을 삭제할까요? 소속 회원은 무소속이 됩니다.`)) return;
                        await deleteOrg(o.id);
                        await load();
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
                {expanded === o.id && (
                  <tr key={o.id + '-members'}>
                    <td colSpan={6} className="bg-white/5 p-3">
                      <MemberTable members={membersByOrg[o.id] ?? []} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-white/30">
                  등록된 기관이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <ErrorLine msg={err} />
    </div>
  );
}
