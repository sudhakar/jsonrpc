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
    private ws?;
    private url;
    private openCB;
    private errCB;
    private id;
    private methods;
    private pending;
    constructor(url: string, openCB?: () => void, errCB?: {
        (...data: any[]): void;
        (message?: any, ...optionalParams: any[]): void;
    });
    private send;
    private on;
    private onclose;
    private connect;
    register(method: string, handler: handlerFn): void;
    call(method: string, params?: any): Promise<any>;
    notify(method: string, params?: any): void;
}
export { JsonRPC, WSRPC };