import { BlockValidatorInfo, EventLog, OperationResult, Plugin, ValidatorOpts } from '@steem-monsters/splinterlands-validator';

function resolveOperationName(action: OperationResult['actions'][number]): string | undefined {
    switch (action.id) {
        case 'validate_block':
            return action.success ? 'validation' : 'validation-rejected';
        case 'update_missed_blocks':
            return action.success ? 'validation-missed' : undefined;
        case 'check_in_validator':
            return action.success ? 'check-in' : 'check-in-rejected';
        case 'update_validator': {
            const params = action.params as { is_active?: boolean };
            if (params.is_active === true) return 'validator-activate';
            if (params.is_active === false) return 'validator-deactivate';
            return undefined;
        }
        case 'activate_license':
            return 'validator-activate';
        case 'deactivate_license':
            return 'validator-deactivate';
        case 'approve_validator':
            return action.success ? 'vote-approve' : 'vote-approve-rejected';
        case 'unapprove_validator':
            return action.success ? 'vote-unapprove' : 'vote-unapprove-rejected';
        case 'token_unstaking':
            return action.success ? 'token-unstaking' : undefined;
        case 'claim_pool':
            return 'claim-pool';
        case 'burn':
            return action.success ? 'burn' : undefined;
        case 'expire_promises':
            return 'expire-promises';
        case 'expire_check_ins':
            return 'expire-check-ins';
        default:
            return undefined;
    }
}

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
    private readonly enabled: boolean;
    private blockStartTime: number = 0;
    private readonly pendingBlocks: Array<{ block_num: number; submit_after_block: number }> = [];

    constructor(private readonly validatorOpts: ValidatorOpts) {
        this.enabled = process.env.ENABLE_EVENT_LOGS === 'true';
    }

    async beforeBlockProcessed(_blockNumber: number): Promise<void> {
        this.blockStartTime = performance.now();
    }

    async onBlockProcessed(
        blockNumber: number,
        _eventLogs: EventLog[],
        _blockHash: string,
        headBlockNumber: number,
        operations?: OperationResult[],
        blockValidator?: BlockValidatorInfo | null,
    ): Promise<void> {
        if (!this.enabled || !operations) {
            return;
        }

        const elapsed = this.blockStartTime > 0 ? Math.round(performance.now() - this.blockStartTime) : undefined;
        this.logOperations(blockNumber, operations);
        this.logBlockReport(blockNumber, operations, blockValidator, elapsed);
        this.trackAndLogPendingValidations(blockNumber, headBlockNumber, blockValidator);
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
                        jsonlog({ operation: 'validator-activate', block: blockNumber, account: op.account });
                        break;
                    case 'deactivate_license':
                        jsonlog({ operation: 'validator-deactivate', block: blockNumber, account: op.account });
                        break;
                    case 'approve_validator':
                        this.logVote(blockNumber, action, op, 'approve');
                        break;
                    case 'unapprove_validator':
                        this.logVote(blockNumber, action, op, 'unapprove');
                        break;
                    case 'token_unstaking':
                        this.logUnstaking(blockNumber, action, op);
                        break;
                    case 'claim_pool':
                        jsonlog({ operation: 'claim-pool', block: blockNumber });
                        break;
                    case 'burn':
                        this.logBurn(blockNumber, action, op);
                        break;
                    case 'expire_promises':
                        jsonlog({ operation: 'expire-promises', block: blockNumber });
                        break;
                    case 'expire_check_ins':
                        jsonlog({ operation: 'expire-check-ins', block: blockNumber });
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
            jsonlog({ operation: 'validation', block: blockNumber, account: op.account, validated_block: validatedBlock, delta });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: 'validation-rejected', block: blockNumber, account: op.account, attempted_block: validatedBlock, reason });
        }
    }

    private logMissedBlocks(blockNumber: number, action: OperationResult['actions'][number]): void {
        if (!action.success) {
            return;
        }
        const params = action.params as { account?: string; checked_block?: number; missed_blocks?: number };
        jsonlog({ operation: 'validation-missed', block: blockNumber, account: params.account, checked_block: params.checked_block, missed: params.missed_blocks });
    }

    private logCheckIn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        if (action.success) {
            jsonlog({ operation: 'check-in', block: blockNumber, account: op.account });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: 'check-in-rejected', block: blockNumber, account: op.account, reason });
        }
    }

    private logValidatorUpdate(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { is_active?: boolean };
        if (params.is_active === true) {
            jsonlog({ operation: 'validator-activate', block: blockNumber, account: op.account });
        } else if (params.is_active === false) {
            jsonlog({ operation: 'validator-deactivate', block: blockNumber, account: op.account });
        }
    }

    private logVote(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, type: 'approve' | 'unapprove'): void {
        const params = action.params as { account_name?: string };
        if (action.success) {
            jsonlog({ operation: `vote-${type}`, block: blockNumber, voter: op.account, validator: params.account_name });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: `vote-${type}-rejected`, block: blockNumber, voter: op.account, validator: params.account_name, reason });
        }
    }

    private logUnstaking(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { player?: string; unstake_amount?: number; token?: string };
        if (action.success) {
            jsonlog({ operation: 'token-unstaking', block: blockNumber, account: params.player ?? op.account, token: params.token, amount: params.unstake_amount });
        }
    }

    private logBurn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { account?: string; to?: string; token?: string; qty?: number };
        if (action.success) {
            jsonlog({ operation: 'burn', block: blockNumber, account: params.account ?? op.account, token: params.token, qty: params.qty, to: params.to });
        }
    }

    private trackAndLogPendingValidations(blockNumber: number, headBlockNumber: number, blockValidator?: BlockValidatorInfo | null): void {
        const delay = this.validatorOpts.validate_block_delay;
        if (delay <= 0) {
            return;
        }

        // If we are the chosen validator for this block, track it
        if (blockValidator && this.validatorOpts.validator_account === blockValidator.account_name) {
            this.pendingBlocks.push({ block_num: blockNumber, submit_after_block: headBlockNumber + delay });
        }

        // Build the report from pending blocks that still have remaining countdown
        const following: string[] = [];
        const kept: typeof this.pendingBlocks = [];
        for (const pending of this.pendingBlocks) {
            const remaining = pending.submit_after_block - headBlockNumber;
            if (remaining > 0) {
                following.push(`${pending.block_num}:${remaining}`);
                kept.push(pending);
            }
            // remaining <= 0 means it will be submitted this block — drop from tracking
        }
        this.pendingBlocks.length = 0;
        this.pendingBlocks.push(...kept);

        if (following.length > 0) {
            jsonlog({ operation: 'validator-report', block: blockNumber, following: following.join(',') });
        }
    }

    private logBlockReport(blockNumber: number, operations: OperationResult[], blockValidator?: BlockValidatorInfo | null, elapsed?: number): void {
        const counts = new Map<string, number>();
        let total = 0;

        for (const op of operations) {
            for (const action of op.actions) {
                total++;
                const name = resolveOperationName(action);
                if (name) {
                    counts.set(name, (counts.get(name) ?? 0) + 1);
                }
            }
        }

        const blockReward = operations[0]?.actions[0]?.op.block_reward;
        const reward = blockReward !== 0 && blockReward ? blockReward[0] : 0;

        const report: Record<string, unknown> = {
            operation: 'block-report',
            block: blockNumber,
            validator: blockValidator?.account_name ?? null,
            total,
            validation: counts.get('validation') ?? 0,
            reward,
            ms: elapsed,
        };

        for (const [name, count] of counts) {
            if (name !== 'validation') {
                report[name] = count;
            }
        }

        jsonlog(report);
    }
}
