const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const WebSocket = isBrowser ? window.WebSocket : (await import('ws')).default;
const RECONNECT_MS = 5000;
class WSRPC {
    constructor(url, openCB = () => { }, errCB = console.error) {
        this.id = 0;
        this.methods = new Map();
        this.pending = new Map();
        this.url = url;
        this.openCB = openCB;
        this.errCB = errCB;
        this.connect();
    }
    send(msg) {
        this.ws.send(msg);
    }
    on(data) {
        const msg = JSON.parse(data);
        // call
        if ('method' in msg) {
            const fn = this.methods.get(msg.method);
            if (!fn) {
                console.error('WSRPC: Cant inovke unknown method', msg.method);
                return;
            }
            if ('id' in msg) {
                const resp = { jsonrpc: '2.0', id: msg.id };
                fn(msg.params)
                    .then((result) => this.send(JSON.stringify({ ...resp, result })))
                    .catch((error) => this.send(JSON.stringify({ ...resp, error })));
                return;
            }
            fn(msg.params);
            return;
        }
        // resolve
        if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            if ('result' in msg)
                resolve(msg.result);
            else
                reject(msg.error);
            return;
        }
    }
    onclose(evt) {
        if (evt.code === 1000) {
            // CLOSE_NORMAL
            console.log('WebSocket: closed');
            return;
        }
        console.log(`Abnormal closure: Reconnecting in ${RECONNECT_MS}ms`);
        setTimeout(() => this.connect(), RECONNECT_MS);
    }
    connect() {
        const ws = (this.ws = new WebSocket(this.url));
        ws.onmessage = (ev) => this.on(ev.data);
        ws.onerror = (ev) => this.errCB(ev.error);
        ws.onopen = () => this.openCB();
        ws.onclose = this.onclose.bind(this);
    }
    register(method, handler) {
        this.methods.set(method, handler);
    }
    call(method, params) {
        const id = this.id++;
        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        try {
            this.send(msg);
        }
        catch (err) {
            return Promise.reject(err);
        }
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }
    notify(method, params) {
        const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
        this.send(msg);
    }
}
async function server() {
    const serverRPC = new WSRPC('');
    serverRPC.notify('onAccessToken', 'some token');
    serverRPC.register('getAccessToken', async () => {
        return 'some token';
    });
    serverRPC.register('getInstrument', async () => {
        return {};
    });
}
// const clientRPC = new WSRPC('')
// clientRPC.register('onAccessToken', async (token: string) => {})
// await clientRPC.call('getInstrument')
export { WSRPC };
