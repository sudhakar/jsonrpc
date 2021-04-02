declare type handlerFn = (params: any) => Promise<any>;
interface JsonRPC {
    /** register a method to be called from other side */
    register: (method: string, handler: handlerFn) => void;
    /** Creates Request object and sends to other side. Returns the Response as Promise. */
    call: (method: string, params?: any) => Promise<any>;
    /** Sends a notification to other side. */
    notify: (method: string, params?: any) => void;
}
declare class WSRPC implements JsonRPC {
    private id;
    private transport;
    private methods;
    private pending;
    constructor(transport: WSTransport);
    private on;
    private send;
    register(method: string, handler: handlerFn): void;
    call(method: string, params?: any): Promise<any>;
    notify(method: string, params?: any): void;
}
interface WSTransport {
    setOnMessage(fn: (data: any) => void): void;
    send(msg: string): void;
}
declare class WSClientTransport implements WSTransport {
    private ws?;
    private url;
    private openCB;
    private errCB;
    private sendBuffer;
    private onmessage;
    constructor(url: string, openCB?: () => void, errCB?: {
        (...data: any[]): void;
        (message?: any, ...optionalParams: any[]): void;
    });
    private onopen;
    private onclose;
    private onerror;
    connect(): void;
    setOnMessage(fn: (data: any) => void): void;
    send(msg: string): void;
    close(code?: number): void;
}
declare class WSServerTransport implements WSTransport {
    private ws;
    private onmessage;
    constructor(ws: WebSocket);
    setOnMessage(fn: (data: any) => void): void;
    send(msg: string): void;
}
export { JsonRPC, WSRPC, WSTransport, WSClientTransport, WSServerTransport };
