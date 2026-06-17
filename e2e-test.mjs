import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://168.107.44.248';
const J = (o) => JSON.stringify(o);

const r = await fetch(BASE + '/api/classrooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const cls = await r.json();
const token = cls.token;
console.log('classroom token:', token);

const sessionId = 'e2e-' + Date.now();
const socket = io(BASE, { transports: ['websocket', 'polling'] });
const joined = await new Promise((res, rej) => {
  socket.on('connect', () => socket.emit('student:join', { token, nickname: 'E2E봇', sessionId }));
  socket.on('joined', res);
  socket.on('errmsg', (e) => rej(new Error(e.message)));
  setTimeout(() => rej(new Error('join timeout')), 15000);
});
console.log('joined:', joined.nickname, joined.sessionId);

const chat = await fetch(BASE + '/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ token, sessionId, activityId: 'chat-first', messages: [{ role: 'user', content: '한 문장으로 인사해줘' }] }) });
console.log('CHAT', chat.status, '→', (await chat.json()).reply);

const lab = await fetch(BASE + '/api/ai/lab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ token, sessionId, activityId: 'lab-context', input: '주말에 볼 영화 추천해줘' }) });
const labj = await lab.json();
console.log('LAB', lab.status, '| A(맥락無):', (labj.outputA || '').replace(/\n/g, ' ').slice(0, 70), '| B(맥락有):', (labj.outputB || '').replace(/\n/g, ' ').slice(0, 70));

const img = await fetch(BASE + '/api/ai/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ token, sessionId, activityId: 'image-gen', prompt: '노을 지는 바닷가의 고양이, 수채화' }) });
const imgj = await img.json();
console.log('IMAGE', img.status, '| demo:', imgj.demo, '| dataUrl bytes:', (imgj.dataUrl || '').length);

socket.close();
process.exit(0);
