import { BlockValidatorInfo, EventLog, OperationResult, Plugin } from '@steem-monsters/splinterlands-validator';

const VALIDATOR_OVERHEAD_ACTIONS = new Set([
    'validate_block',
    'check_in_validator',
    'update_missed_blocks',
    'expire_check_ins',
    'approve_validator',
    'unapprove_validator',
    'update_validator',
    'activate_license',
    'deactivate_license',
    'price_feed',
]);

function jsonlog(...args: Array<string | Record<string, unknown>>): void {
    const strings: string[] = [];
    const objects: Record<string, unknown>[] = [];
    for (const arg of args) {
        if (typeof arg === 'string') {
            strings.push(arg);
        } else {
            objects.push(arg);
        }
    }
    const entry: Record<string, unknown> = {
        date: new Date().toISOString(),
        level: 'debug',
        service: 'spsdao-validator',
    };
    for (const obj of objects) {
        Object.assign(entry, obj);
    }
    if (strings.length > 0) {
        entry.message = strings.join('\n');
    }
    console.log(JSON.stringify(entry));
}

export class EventLoggingPlugin implements Plugin {
    readonly name = 'EventLoggingPlugin';

    async onBlockProcessed(
        blockNumber: number,
        _eventLogs: EventLog[],
        _blockHash: string,
        _headBlockNumber: number,
        operations?: OperationResult[],
        blockValidator?: BlockValidatorInfo | null,
    ): Promise<void> {
        if (!operations) {
            return;
        }

        this.logBlockValidator(blockNumber, blockValidator);
        this.logOperations(blockNumber, operations);
        this.logBlockReport(blockNumber, operations);
    }

    private logBlockValidator(blockNumber: number, blockValidator?: BlockValidatorInfo | null): void {
        if (blockValidator) {
            jsonlog({ action: 'validator-assigned', block: blockNumber, validator: blockValidator.account_name });
        }
    }

    private logOperations(blockNumber: number, operations: OperationResult[]): void {
        for (const op of operations) {
            for (const action of op.actions) {
                switch (action.id) {
                    case 'validate_block':
                        this.logValidation(blockNumber, action, op);
                        break;
                    case 'update_missed_blocks':
                        this.logMissedBlocks(blockNumber, action);
                        break;
                    case 'check_in_validator':
                        this.logCheckIn(blockNumber, action, op);
                        break;
                    case 'update_validator':
                        this.logValidatorUpdate(blockNumber, action, op);
                        break;
                    case 'activate_license':
                        jsonlog({ action: 'validator-activate', block: blockNumber, account: op.account });
                        break;
                    case 'deactivate_license':
                        jsonlog({ action: 'validator-deactivate', block: blockNumber, account: op.account });
                        break;
                    case 'approve_validator':
                        this.logVote(blockNumber, action, op, 'approve');
                        break;
                    case 'unapprove_validator':
                        this.logVote(blockNumber, action, op, 'unapprove');
                        break;
                }
            }
        }
    }

    private logValidation(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { block_num?: number };
        const validatedBlock = params.block_num ?? 0;
        const delta = blockNumber - validatedBlock;

        if (action.success) {
            jsonlog({ action: 'validation', block: blockNumber, account: op.account, validated_block: validatedBlock, delta });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ action: 'validation-rejected', block: blockNumber, account: op.account, attempted_block: validatedBlock, reason });
        }
    }

    private logMissedBlocks(blockNumber: number, action: OperationResult['actions'][number]): void {
        if (!action.success) {
            return;
        }
        const params = action.params as { account?: string; checked_block?: number; missed_blocks?: number };
        jsonlog({ action: 'validation-missed', block: blockNumber, account: params.account, checked_block: params.checked_block, missed: params.missed_blocks });
    }

    private logCheckIn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        if (action.success) {
            jsonlog({ action: 'check-in', block: blockNumber, account: op.account });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ action: 'check-in-rejected', block: blockNumber, account: op.account, reason });
        }
    }

    private logValidatorUpdate(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { is_active?: boolean };
        if (params.is_active === true) {
            jsonlog({ action: 'validator-activate', block: blockNumber, account: op.account });
        } else if (params.is_active === false) {
            jsonlog({ action: 'validator-deactivate', block: blockNumber, account: op.account });
        }
    }

    private logVote(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, type: 'approve' | 'unapprove'): void {
        const params = action.params as { account_name?: string };
        if (action.success) {
            jsonlog({ action: `vote-${type}`, block: blockNumber, voter: op.account, validator: params.account_name });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ action: `vote-${type}-rejected`, block: blockNumber, voter: op.account, validator: params.account_name, reason });
        }
    }

    private logBlockReport(blockNumber: number, operations: OperationResult[]): void {
        let totalActions = 0;
        let overheadActions = 0;

        for (const op of operations) {
            for (const action of op.actions) {
                totalActions++;
                if (VALIDATOR_OVERHEAD_ACTIONS.has(action.id)) {
                    overheadActions++;
                }
            }
        }

        const gameActions = totalActions - overheadActions;
        jsonlog({ action: 'block-report', block: blockNumber, total: totalActions, game: gameActions, overhead: overheadActions });
    }
}
