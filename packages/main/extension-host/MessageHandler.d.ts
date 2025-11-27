/**
 * 消息处理器
 */
import { APIImplementation } from './APIImplementation';
export declare class MessageHandler {
    private api;
    constructor(api: APIImplementation);
    handle(message: any): void;
    private handleActivateExtension;
    private handleExecuteCommand;
}
//# sourceMappingURL=MessageHandler.d.ts.map