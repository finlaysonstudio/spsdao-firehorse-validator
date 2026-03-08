import { BlockValidatorInfo, EventLog, log, LogLevel, OperationResult, Plugin } from '@steem-monsters/splinterlands-validator';

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
            log(`[validator-assigned] block=${blockNumber} validator=${blockValidator.account_name}`, LogLevel.Info);
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
                        log(`[validator-activate] block=${blockNumber} account=${op.account}`, LogLevel.Info);
                        break;
                    case 'deactivate_license':
                        log(`[validator-deactivate] block=${blockNumber} account=${op.account}`, LogLevel.Info);
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
            log(`[validation] block=${blockNumber} account=${op.account} validated_block=${validatedBlock} delta=${delta}`, LogLevel.Info);
        } else {
            const errorMsg = action.error?.message ?? 'unknown';
            log(`[validation-rejected] block=${blockNumber} account=${op.account} attempted_block=${validatedBlock} reason="${errorMsg}"`, LogLevel.Warning);
        }
    }

    private logMissedBlocks(blockNumber: number, action: OperationResult['actions'][number]): void {
        if (!action.success) {
            return;
        }
        const params = action.params as { account?: string; checked_block?: number; missed_blocks?: number };
        log(`[validation-missed] block=${blockNumber} account=${params.account} checked_block=${params.checked_block} missed=${params.missed_blocks}`, LogLevel.Warning);
    }

    private logCheckIn(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        if (action.success) {
            log(`[check-in] block=${blockNumber} account=${op.account}`, LogLevel.Info);
        } else {
            const errorMsg = action.error?.message ?? 'unknown';
            log(`[check-in-rejected] block=${blockNumber} account=${op.account} reason="${errorMsg}"`, LogLevel.Warning);
        }
    }

    private logValidatorUpdate(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult): void {
        const params = action.params as { is_active?: boolean };
        if (params.is_active === true) {
            log(`[validator-activate] block=${blockNumber} account=${op.account}`, LogLevel.Info);
        } else if (params.is_active === false) {
            log(`[validator-deactivate] block=${blockNumber} account=${op.account}`, LogLevel.Info);
        }
    }

    private logVote(blockNumber: number, action: OperationResult['actions'][number], op: OperationResult, type: 'approve' | 'unapprove'): void {
        const params = action.params as { account_name?: string };
        if (action.success) {
            log(`[vote-${type}] block=${blockNumber} voter=${op.account} validator=${params.account_name}`, LogLevel.Info);
        } else {
            const errorMsg = action.error?.message ?? 'unknown';
            log(`[vote-${type}-rejected] block=${blockNumber} voter=${op.account} validator=${params.account_name} reason="${errorMsg}"`, LogLevel.Warning);
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
        log(`[block-report] block=${blockNumber} total=${totalActions} game=${gameActions} overhead=${overheadActions}`, LogLevel.Info);
    }
}
