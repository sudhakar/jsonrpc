type handlerFn = (params: any) => Promise<any>
type promisePair = { resolve: Function; reject: Function }

interface JsonRPC {
  /** register a method to be called from other side */
  register: (method: string, handler: handlerFn) => void

  /** Creates Request object and sends to other side. Returns the Response as Promise. */
  call: (method: string, params?: any) => Promise<any>

  /** Sends a notification to other side. */
  notify: (method: string, params?: any) => void
}

const isBrowser = () => ![typeof window, typeof document].includes('undefined')

let WebSocket = isBrowser() ? window.WebSocket : await import('ws')

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
  private transport: WSTransport
  private methods: Map<string, handlerFn> = new Map()
  private pending: Map<number, promisePair> = new Map()

  constructor(transport: WSTransport) {
    this.transport = transport
    transport.setOnMessage(this.on.bind(this))
  }

  private on(data: string) {
    const msg = JSON.parse(data)

    // call
    if ('method' in msg) {
      const fn = this.methods.get(msg.method)
      if (!fn) {
        const err = { ...NO_METHOD_ERRPR }
        err.data += `method=${msg.method}`
        if ('id' in msg) {
          this.send(JSON.stringify({ id: msg.id, error: err }))
        } else {
          console.error(`WSRPC: Cant 'notify' unknown method "${msg.method}"`)
        }
        return
      }

      // request
      if ('id' in msg) {
        const resp = { /*jsonrpc: '2.0',*/ id: msg.id }

        fn(msg.params)
          .then(result => this.send(JSON.stringify({ ...resp, result })))
          .catch(error => {
            const msg = { ...resp, error: { ...SERVER_ERROR } }
            msg.error.data += `name=${error.name}, message=${error.message}`
            this.send(JSON.stringify(msg))
          })
        return
      }

      // notify
      fn(msg.params)
      return
    }

    // resolve
    if ('id' in msg) {
      if (!this.pending.has(msg.id)) {
        console.error('WSRPC: Cant resolve requestID: ', msg.id)
        return
      }

      const { resolve, reject } = this.pending.get(msg.id)!
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

  private send(msg: string) {
    this.transport.send(msg)
  }

  public register(method: string, handler: handlerFn) {
    this.methods.set(method, handler)
  }

  public call(method: string, params?: any): Promise<any> {
    const id = this.id++
    const msg = JSON.stringify({ /*jsonrpc: '2.0',*/ id, method, params })

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
    const msg = JSON.stringify({ /*jsonrpc: '2.0',*/ method, params })
    this.send(msg)
  }
}

interface WSTransport {
  setOnMessage(fn: (data: any) => void): void
  send(msg: string): void
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
  private onmessage = (data: any) => {}

  constructor(url: string, openCB = () => {}, errCB = console.error) {
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
  private onmessage = (data: any) => {}

  constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.onmessage = evt => this.onmessage(evt.data)
  }

  public setOnMessage(fn: (data: any) => void) {
    this.onmessage = fn
  }

  public send(msg: string) {
    this.ws.send(msg)
  }
}

export { JsonRPC, WSRPC, WSTransport, WSClientTransport, WSServerTransport }
