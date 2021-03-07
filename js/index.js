const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const WebSocket = isBrowser ? window.WebSocket : (await import('ws')).default;
const MAX_BUF_SIZE = 100;
const RECONNECT_MS = 5000;
const NOISY_ERRS = new Set(['ECONNREFUSED']);
const SERVER_ERROR = {
    code: -32000,
    msg: 'ServerError',
    data: 'Error from called method. ',
};
const NO_METHOD_ERRPR = {
    code: -32601,
    msg: 'NoMethodError',
    data: 'No such function. ',
};
class WSRPC {
    constructor(url, openCB = () => { }, errCB = console.error) {
        this.id = 0;
        this.sendBuffer = [];
        this.methods = new Map();
        this.pending = new Map();
        this.url = url;
        this.openCB = openCB;
        this.errCB = errCB;
        this.connect();
    }
    on(data) {
        const msg = JSON.parse(data);
        // call
        if ('method' in msg) {
            const fn = this.methods.get(msg.method);
            if (!fn) {
                const err = { ...NO_METHOD_ERRPR };
                err.data += `method=${msg.method}`;
                if ('id' in msg) {
                    this.send(JSON.stringify({ id: msg.id, error: err }));
                }
                else {
                    console.error(`WSRPC: Cant 'notify' unknown method "${msg.method}"`);
                }
                return;
            }
            // request
            if ('id' in msg) {
                const resp = { /*jsonrpc: '2.0',*/ id: msg.id };
                fn(msg.params)
                    .then(result => this.send(JSON.stringify({ ...resp, result })))
                    .catch(error => {
                    const msg = { ...resp, error: { ...SERVER_ERROR } };
                    msg.error.data += `name=${error.name}, message=${error.message}`;
                    this.send(JSON.stringify(msg));
                });
                return;
            }
            // notify
            fn(msg.params);
            return;
        }
        // resolve
        if ('id' in msg) {
            if (!this.pending.has(msg.id)) {
                console.error('WSRPC: Cant resolve requestID: ', msg.id);
                return;
            }
            const { resolve, reject } = this.pending.get(msg.id);
            if ('result' in msg)
                resolve(msg.result);
            else if ('error' in msg)
                reject(msg.error);
            else {
                console.warn(`Received msgID=${msg.id} with neither 'result' or 'error'. ` +
                    `Likely service method is for 'notify' but is called as 'request'`);
                resolve();
            }
            return;
        }
    }
    send(msg) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            this.sendBuffer.push(msg);
            console.log(this.sendBuffer.length);
            if (this.sendBuffer.length >= MAX_BUF_SIZE) {
                throw new Error(`sendBuffer is overflowing!. Max=${MAX_BUF_SIZE}`);
            }
            return;
        }
        this.ws.send(msg);
    }
    onopen() {
        const bufSize = this.sendBuffer.length;
        for (let i = 0; i < bufSize; i++) {
            this.send(this.sendBuffer.shift());
        }
        this.openCB();
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
    onerror(err) {
        if (err && NOISY_ERRS.has(err.code))
            return;
        this.errCB(err);
    }
    connect() {
        const ws = (this.ws = new WebSocket(this.url));
        ws.onmessage = (ev) => this.on(ev.data);
        ws.onerror = (ev) => this.onerror(ev.error);
        ws.onopen = () => this.onopen();
        ws.onclose = this.onclose.bind(this);
    }
    register(method, handler) {
        this.methods.set(method, handler);
    }
    call(method, params) {
        const id = this.id++;
        const msg = JSON.stringify({ /*jsonrpc: '2.0',*/ id, method, params });
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
        const msg = JSON.stringify({ /*jsonrpc: '2.0',*/ method, params });
        this.send(msg);
    }
}
export { WSRPC };
