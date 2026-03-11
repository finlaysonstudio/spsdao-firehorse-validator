import { BlockValidatorInfo, EventLog, OperationResult, Plugin, ValidatorOpts } from '@steem-monsters/splinterlands-validator';
import { jsonlog } from './jsonlog';

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

export class EventLoggingPlugin implements Plugin {
    readonly name = 'EventLoggingPlugin';
    private readonly enabled: boolean;
    private blockStartTime = 0;
    private readonly pendingBlocks: Array<{ block_num: number; submit_after_block: number; account: string }> = [];

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
        const status = this.getStatus(blockNumber, headBlockNumber);
        if (status === 'streaming') {
            this.logOperations(blockNumber, operations, blockValidator);
        }
        const delta = status === 'replay' ? headBlockNumber - blockNumber : undefined;
        this.logBlockReport(blockNumber, operations, blockValidator, elapsed, status, delta);
        if (status === 'streaming') {
            this.trackAndLogPendingValidations(blockNumber, headBlockNumber, operations, blockValidator);
        }
    }

    private logOperations(blockNumber: number, operations: OperationResult[], blockValidator?: BlockValidatorInfo | null): void {
        const validator = blockValidator?.account_name ?? null;
        for (const op of operations) {
            for (const action of op.actions) {
                switch (action.id) {
                    case 'validate_block':
                        this.logValidation(blockNumber, action, op, validator);
                        break;
                    case 'update_missed_blocks':
                        this.logMissedBlocks(blockNumber, action, validator);
                        break;
                    case 'check_in_validator':
                        this.logCheckIn(blockNumber, action, op, validator);
                        break;
                    case 'update_validator':
                        this.logValidatorUpdate(blockNumber, action, op, validator);
                        break;
                    case 'activate_license':
                        jsonlog({ operation: 'validator-activate', block: blockNumber, validator, account: op.account });
                        break;
                    case 'deactivate_license':
                        jsonlog({ operation: 'validator-deactivate', block: blockNumber, validator, account: op.account });
                        break;
                    case 'approve_validator':
                        this.logVote(blockNumber, action, op, 'approve', validator);
                        break;
                    case 'unapprove_validator':
                        this.logVote(blockNumber, action, op, 'unapprove', validator);
                        break;
                    case 'token_unstaking':
                        this.logUnstaking(blockNumber, action, op, validator);
                        break;
                    case 'claim_pool':
                        jsonlog({ operation: 'claim-pool', block: blockNumber, validator });
                        break;
                    case 'burn':
                        this.logBurn(blockNumber, action, op, validator);
                        break;
                    case 'expire_promises':
                        jsonlog({ operation: 'expire-promises', block: blockNumber, validator });
                        break;
                    case 'expire_check_ins':
                        jsonlog({ operation: 'expire-check-ins', block: blockNumber, validator });
                        break;
                }
            }
        }
    }

    private logValidation(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, validator: string | null): void {
        const params = action.params as { block_num?: number };
        const validatedBlock = params.block_num ?? 0;
        const delta = blockNumber - validatedBlock;

        if (action.success) {
            jsonlog({ operation: 'validation', block: blockNumber, validator, account: op.account, validated_block: validatedBlock, delta });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: 'validation-rejected', block: blockNumber, validator, account: op.account, attempted_block: validatedBlock, reason });
        }
    }

    private logMissedBlocks(blockNumber: number, action: OperationResult['actions'][number], validator: string | null): void {
        if (!action.success) {
            return;
        }
        const params = action.params as { account?: string; checked_block?: number; missed_blocks?: number };
        jsonlog({ operation: 'validation-missed', block: blockNumber, validator, account: params.account, checked_block: params.checked_block, missed: params.missed_blocks });
    }

    private logCheckIn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, validator: string | null): void {
        if (action.success) {
            jsonlog({ operation: 'check-in', block: blockNumber, validator, account: op.account });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: 'check-in-rejected', block: blockNumber, validator, account: op.account, reason });
        }
    }

    private logValidatorUpdate(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, validator: string | null): void {
        const params = action.params as { is_active?: boolean };
        if (params.is_active === true) {
            jsonlog({ operation: 'validator-activate', block: blockNumber, validator, account: op.account });
        } else if (params.is_active === false) {
            jsonlog({ operation: 'validator-deactivate', block: blockNumber, validator, account: op.account });
        }
    }

    private logVote(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, type: 'approve' | 'unapprove', validator: string | null): void {
        const params = action.params as { account_name?: string };
        if (action.success) {
            jsonlog({ operation: `vote-${type}`, block: blockNumber, validator, voter: op.account, target: params.account_name });
        } else {
            const reason = action.error?.message ?? 'unknown';
            jsonlog({ operation: `vote-${type}-rejected`, block: blockNumber, validator, voter: op.account, target: params.account_name, reason });
        }
    }

    private logUnstaking(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, validator: string | null): void {
        const params = action.params as { player?: string; unstake_amount?: number; token?: string };
        if (action.success) {
            jsonlog({ operation: 'token-unstaking', block: blockNumber, validator, account: params.player ?? op.account, token: params.token, amount: params.unstake_amount });
        }
    }

    private logBurn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, validator: string | null): void {
        const params = action.params as { account?: string; to?: string; token?: string; qty?: number };
        if (action.success) {
            jsonlog({ operation: 'burn', block: blockNumber, validator, account: params.account ?? op.account, token: params.token, qty: params.qty, to: params.to });
        }
    }

    private getStatus(blockNumber: number, headBlockNumber: number): 'replay' | 'streaming' {
        const gap = headBlockNumber - blockNumber;
        const threshold = this.validatorOpts.blocks_behind_head + 2;
        return gap > threshold ? 'replay' : 'streaming';
    }

    private trackAndLogPendingValidations(blockNumber: number, headBlockNumber: number, operations: OperationResult[], blockValidator?: BlockValidatorInfo | null): void {
        const delay = this.validatorOpts.validate_block_delay;
        if (delay <= 0) {
            return;
        }

        // If we are the chosen validator for this block, track it
        if (blockValidator && this.validatorOpts.validator_account === blockValidator.account_name) {
            this.pendingBlocks.push({ block_num: blockNumber, submit_after_block: headBlockNumber + delay, account: blockValidator.account_name });
        }

        // Collect block numbers that were successfully validated this round
        const validatedBlocks = new Set<number>();
        for (const op of operations) {
            for (const action of op.actions) {
                if (action.id === 'validate_block' && action.success) {
                    const params = action.params as { block_num?: number };
                    if (params.block_num) {
                        validatedBlocks.add(params.block_num);
                    }
                }
            }
        }

        // Log and filter pending blocks
        const kept: typeof this.pendingBlocks = [];
        for (const pending of this.pendingBlocks) {
            // Drop blocks that were already validated on-chain
            if (validatedBlocks.has(pending.block_num)) {
                continue;
            }
            const remaining = pending.submit_after_block - headBlockNumber;
            if (remaining > 0) {
                jsonlog({ operation: 'follower-report', block: blockNumber, account: pending.account, delta: remaining, validated_block: pending.block_num });
                kept.push(pending);
            }
            // remaining <= 0 means it will be submitted this block — drop from tracking
        }
        this.pendingBlocks.length = 0;
        this.pendingBlocks.push(...kept);
    }

    private logBlockReport(
        blockNumber: number,
        operations: OperationResult[],
        blockValidator?: BlockValidatorInfo | null,
        elapsed?: number,
        status?: 'replay' | 'streaming',
        delta?: number,
    ): void {
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

        const firstAction = operations.flatMap((op) => op.actions).find((a) => a.op.block_reward !== 0);
        const reward = firstAction ? (firstAction.op.block_reward as [number, string])[0] : 0;

        const role = this.validatorOpts.validate_block_delay > 0 ? 'follower' : 'leader';
        const report: Record<string, unknown> = {
            operation: 'block-report',
            block: blockNumber,
            role,
            status,
            delta,
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
