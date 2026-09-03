// k6 용 최소 socket.io 클라이언트 (Engine.IO v4 · websocket 전송만).
// k6 는 npm socket.io-client 를 못 쓰므로 프레임을 직접 다룬다.
//   0{...}  open (서버→클라)      40   네임스페이스 연결 요청/응답
//   2 ping (서버→클라) → 3 pong   42["event", payload]  이벤트
import ws from 'k6/ws';

export function sioUrl(base) {
  return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/socket.io/?EIO=4&transport=websocket';
}

export function emit(socket, event, payload) {
  socket.send('42' + JSON.stringify([event, payload]));
}

// 수신 프레임 → { type: 'open'|'connected'|'ping'|'event'|'other', event?, payload? }
export function parse(msg) {
  if (msg === '2') return { type: 'ping' };
  if (msg.startsWith('0')) return { type: 'open' };
  if (msg.startsWith('40')) return { type: 'connected' };
  if (msg.startsWith('42')) {
    try {
      const arr = JSON.parse(msg.slice(2));
      return { type: 'event', event: arr[0], payload: arr[1] };
    } catch (_) { /* 무시 */ }
  }
  return { type: 'other' };
}

/**
 * socket.io 연결을 열고 핸드셰이크(open → 40 → 40{sid}) 후 onConnected 를 부른다.
 * handlers.onEvent(socket, event, payload, ctx) 로 이벤트를 받는다. ping 은 자동으로 pong.
 * ws.connect 는 소켓이 닫힐 때까지 블록되므로 handlers 안에서 socket.close() 로 끝낸다.
 */
export function connect(base, handlers) {
  const ctx = { openedAt: 0, connectedAt: 0 };
  return ws.connect(sioUrl(base), { tags: handlers.tags }, function (socket) {
    socket.on('open', () => { ctx.openedAt = Date.now(); });
    socket.on('message', (msg) => {
      const f = parse(msg);
      if (f.type === 'ping') return socket.send('3');
      if (f.type === 'open') return socket.send('40');
      if (f.type === 'connected') {
        ctx.connectedAt = Date.now();
        if (handlers.onConnected) handlers.onConnected(socket, ctx);
        return;
      }
      if (f.type === 'event' && handlers.onEvent) handlers.onEvent(socket, f.event, f.payload, ctx);
    });
    socket.on('error', (e) => { if (handlers.onError) handlers.onError(e, ctx); });
    socket.on('close', () => { if (handlers.onClose) handlers.onClose(ctx); });
    // 안전망: 상한 시간이 지나면 강제 종료
    socket.setTimeout(() => socket.close(), (handlers.maxMs || 120000));
  });
}
