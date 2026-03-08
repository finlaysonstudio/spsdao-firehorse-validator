import { EventLog } from '../entities/event_log';
import { IAction } from '../actions/action';
import * as utils from '../utils';
import { LogLevel } from '../utils';

export interface OperationResult {
    readonly isVirtual: boolean;
    readonly account: string;
    readonly actions: ReadonlyArray<IAction>;
}

export interface BlockValidatorInfo {
    readonly account_name: string;
}

export interface Plugin {
    readonly name: string;
    beforeBlockProcessed?: (blockNumber: number) => Promise<void>;
    onBlockProcessed?: (
        blockNumber: number,
        eventLogs: EventLog[],
        blockHash: string,
        headBlockNumber: number,
        operations?: OperationResult[],
        blockValidator?: BlockValidatorInfo | null,
    ) => Promise<void>;
}

export class PluginDispatcherBuilder {
    public static create(): PluginDispatcherBuilder {
        return new PluginDispatcherBuilder([]);
    }

    private constructor(private readonly plugins: Plugin[]) {}

    public addPlugin(plugin: Plugin): PluginDispatcherBuilder {
        return new PluginDispatcherBuilder([...this.plugins, plugin]);
    }

    public build(): PluginDispatcher {
        return new PluginDispatcher(this.plugins);
    }
}

export class PluginDispatcher {
    public constructor(private readonly plugins: Plugin[]) {}

    public dispatchBefore(blockNumber: number): void {
        this.plugins.forEach((x) => {
            x.beforeBlockProcessed?.(blockNumber).catch((reason: unknown) => {
                utils.log(`Error dispatching before data to plugin ${x.name}: ${reason}`, LogLevel.Error);
            });
        });
    }

    public dispatch(
        blockNumber: number,
        eventLogs: EventLog[],
        blockHash: string,
        headBlockNumber: number,
        operations?: OperationResult[],
        blockValidator?: BlockValidatorInfo | null,
    ): void {
        this.plugins.forEach((x) => {
            x.onBlockProcessed?.(blockNumber, eventLogs, blockHash, headBlockNumber, operations, blockValidator).catch((reason: unknown) => {
                utils.log(`Error dispatching data to plugin ${x.name}: ${reason}`, LogLevel.Error);
            });
        });
    }
}
