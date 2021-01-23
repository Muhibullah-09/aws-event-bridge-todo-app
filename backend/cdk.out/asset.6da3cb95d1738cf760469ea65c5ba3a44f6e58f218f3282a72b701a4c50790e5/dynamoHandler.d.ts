import { EventBridgeEvent, Context } from 'aws-lambda';
export declare const handler: (event: EventBridgeEvent<string, any>, context: Context) => Promise<void>;
