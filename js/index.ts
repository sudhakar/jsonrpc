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

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'
const WebSocket = isBrowser ? window.WebSocket : (await import('ws')).default

const RECONNECT_MS = 5000

class WSRPC implements JsonRPC {
  private ws?: WebSocket
  private url: string
  private openCB: () => void
  private errCB: (e: Error) => void

  private id = 0
  private methods: Map<string, handlerFn> = new Map()
  private pending: Map<number, promisePair> = new Map()

  constructor(url: string, openCB = () => {}, errCB = console.error) {
    this.url = url
    this.openCB = openCB
    this.errCB = errCB

    this.connect()
  }

  private send(msg: string) {
    this.ws!.send(msg)
  }

  private on(data: string) {
    const msg = JSON.parse(data)

    // call
    if ('method' in msg) {
      const fn = this.methods.get(msg.method)
      if (!fn) {
        console.error(`WSRPC: Cant inovke unknown method "${msg.method}"`)
        return
      }

      // request
      if ('id' in msg) {
        const resp = { jsonrpc: '2.0', id: msg.id }

        fn(msg.params)
          .then(result => this.send(JSON.stringify({ ...resp, result })))
          .catch(error => this.send(JSON.stringify({ ...resp, error })))
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
      else reject(msg.error)
      return
    }
  }

  private onclose(evt: any) {
    if (evt.code === 1000) {
      // CLOSE_NORMAL
      console.log('WebSocket: closed')
      return
    }

    console.log(`Abnormal closure: Reconnecting in ${RECONNECT_MS}ms`)
    setTimeout(() => this.connect(), RECONNECT_MS)
  }

  private connect() {
    const ws = (this.ws = new WebSocket(this.url) as WebSocket)
    ws.onmessage = (ev: any) => this.on(ev.data)
    ws.onerror = (ev: any) => this.errCB(ev.error)
    ws.onopen = () => this.openCB()
    ws.onclose = this.onclose.bind(this)
  }

  public register(method: string, handler: handlerFn) {
    this.methods.set(method, handler)
  }

  public call(method: string, params?: any): Promise<any> {
    const id = this.id++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params })

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
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params })
    this.send(msg)
  }
}

async function server() {
  const serverRPC = new WSRPC('')

  serverRPC.notify('onAccessToken', 'some token')

  serverRPC.register('getAccessToken', async () => {
    return 'some token'
  })

  serverRPC.register('getInstrument', async () => {
    return {}
  })
}

// const clientRPC = new WSRPC('')

// clientRPC.register('onAccessToken', async (token: string) => {})

// await clientRPC.call('getInstrument')

export { JsonRPC, WSRPC }