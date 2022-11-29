type handlerFn = (params: any) => Promise<any>
type promisePair = { resolve: Function; reject: Function }

type Message = {
  method?: string
  id?: number
  params?: any
  result?: any
  error?: any
}

export interface SerDe {
  encode(data: Message): any
  decode(obj: any): Message
}

const JSONSerDe: SerDe = {
  encode: (data) => JSON.stringify(data),
  decode: (obj) => JSON.parse(obj),
}

const NOOPSerDe: SerDe = {
  encode: (data) => data,
  decode: (obj) => obj,
}

export interface JsonRPC {
  /** register a method to be called from other side */
  register: (method: string, handler: handlerFn) => void

  /** Creates Request object and sends to other side. Returns the Response as Promise. */
  call: (method: string, params?: any) => Promise<any>

  /** Sends a notification to other side. */
  notify: (method: string, params?: any) => void
}

if (typeof WebSocket == 'undefined') globalThis.WebSocket = require('ws')

const MAX_BUF_SIZE = 100
const RECONNECT_MS = 5000
const NOISY_ERRS = new Set(['ECONNREFUSED'])

const SERVER_ERROR = {
  code: -32000,
  msg: 'ServerError',
  data: 'Error from called method. ',
}

const NO_METHOD_ERRPR = {
  code: -32601,
  msg: 'NoMethodError',
  data: 'No such function. ',
}

class WSRPC implements JsonRPC {
  private id = 0
  private serde: SerDe
  private transport: WSTransport
  private methods: Map<string, handlerFn> = new Map()
  private pending: Map<number, promisePair> = new Map()

  constructor(transport: WSTransport, serde = JSONSerDe) {
    this.transport = transport
    this.serde = serde
    transport.setOnMessage((data: any) => this.on(serde.decode(data)))
  }

  private on(msg: Message) {

    // call
    if ('method' in msg) {
      const fn = this.methods.get(msg.method!)
      if (!fn) {
        const err = { ...NO_METHOD_ERRPR }
        err.data += `method=${msg.method}`
        if ('id' in msg) {
          this.send({ id: msg.id, error: err })
        } else {
          console.error(`WSRPC: Cant 'notify' unknown method "${msg.method}"`)
        }
        return
      }

      // request
      if ('id' in msg) {
        const resp = { /*jsonrpc: '2.0',*/ id: msg.id }

        fn(msg.params)
          .then(result => this.send({ ...resp, result }))
          .catch(error => {
            const msg = { ...resp, error: { ...SERVER_ERROR } }
            msg.error.data += `name=${error.name}, message=${error.message}`
            this.send(msg)
          })
        return
      }

      // notify
      fn(msg.params)
      return
    }

    // resolve
    if ('id' in msg) {
      if (!this.pending.has(msg.id!)) {
        console.error('WSRPC: Cant resolve requestID: ', msg.id)
        return
      }

      const { resolve, reject } = this.pending.get(msg.id!)!
      if ('result' in msg) resolve(msg.result)
      else if ('error' in msg) reject(msg.error)
      else {
        console.warn(
          `Received msgID=${msg.id} with neither 'result' or 'error'. ` +
          `Likely service method is for 'notify' but is called as 'request'`,
        )
        resolve()
      }
      return
    }
  }

  private send(msg: Message) {
    this.transport.send(this.serde.encode(msg))
  }

  public register(method: string, handler: handlerFn) {
    this.methods.set(method, handler)
  }

  public call(method: string, params?: any): Promise<any> {
    const id = this.id++
    const msg = { /*jsonrpc: '2.0',*/ id, method, params }

    try {
      this.send(msg)
    } catch (err) {
      return Promise.reject(err)
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  public notify(method: string, params?: any) {
    const msg = { /*jsonrpc: '2.0',*/ method, params }
    this.send(msg)
  }
}

export interface WSTransport {
  setOnMessage(fn: (data: any) => void): void
  send(msg: any): void
}

export interface WorkerLike {
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null;
  postMessage(message: any, options?: any): void;
}

/**
 * WSClientTransport websocket client with reconnection & buffering
 */
class WSClientTransport implements WSTransport {
  private ws?: WebSocket

  private url: string
  private openCB: () => void
  private errCB: (e: Error) => void
  private sendBuffer: string[] = []
  private onmessage = (data: any) => { }

  constructor(url: string, openCB = () => { }, errCB = console.error) {
    this.url = url
    this.openCB = openCB
    this.errCB = errCB
  }

  private onopen() {
    const bufSize = this.sendBuffer.length
    for (let i = 0; i < bufSize; i++) {
      this.send(this.sendBuffer.shift()!)
    }

    this.openCB()
  }

  private onclose(evt: any) {
    if (evt.code === 1000) {
      // CLOSE_NORMAL
      console.log('WebSocket: closed')
      return
    }

    console.log(`Code=${evt.code}. Reconnecting in ${RECONNECT_MS}ms`)
    setTimeout(() => this.connect(), RECONNECT_MS)
  }

  private onerror(err: any) {
    if (err && NOISY_ERRS.has(err.code)) return
    this.errCB(err)
  }

  public connect() {
    const ws = (this.ws = new WebSocket(this.url) as WebSocket)
    ws.onmessage = (ev: any) => this.onmessage(ev.data)
    ws.onerror = (ev: any) => this.onerror(ev.error)
    ws.onopen = () => this.onopen()
    ws.onclose = this.onclose.bind(this)
  }

  public setOnMessage(fn: (data: any) => void) {
    this.onmessage = fn
  }

  public send(msg: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.sendBuffer.push(msg)
      if (this.sendBuffer.length >= MAX_BUF_SIZE) {
        throw new Error(`sendBuffer is overflowing!. Max=${MAX_BUF_SIZE}`)
      }
      return
    }
    this.ws?.send(msg)
  }

  public close(code = 1000) {
    this.ws?.close(code)
  }
}

class WSServerTransport implements WSTransport {
  private ws: WebSocket

  constructor(ws: WebSocket) {
    this.ws = ws
  }

  public setOnMessage(fn: (data: any) => void) {
    this.ws.onmessage = evt => fn(evt.data)
  }

  public send(msg: string) {
    this.ws.send(msg)
  }
}
/**
 * WebWorkerTransport supports both Worker & SharedWorker on the main thread side
 * On the Worker side either pass MessagePort for SharedWorker or
 * pass a WorkerLike like object with `onmessage` and `postMessage` methods
 */
class WebWorkerTransport implements WSTransport {
  private worker: Worker | WorkerLike

  constructor(worker: Worker | WorkerLike) {
    this.worker = worker
  }

  public setOnMessage(fn: (data: any) => void): void {
    this.worker.onmessage = evt => fn(evt.data)
  }

  public send(msg: string): void {
    this.worker.postMessage(msg)
  }
}

module.exports = {
  JSONSerDe,
  NOOPSerDe,
  WSRPC,
  WSClientTransport,
  WSServerTransport,
  WebWorkerTransport,
}
