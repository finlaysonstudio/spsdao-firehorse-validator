import '@abraham/reflection';
import { assertConsensusMathPow, EntryPoint } from '@steem-monsters/splinterlands-validator';
import { CompositionRoot, container } from './sps/composition-root';

async function start(): Promise<void> {
    try {
        // Refuse to start if floating point pow differs from the reference implementation (see README Runtime).
        assertConsensusMathPow();
        CompositionRoot.assertValidRegistry();
        const ep = container.resolve(EntryPoint);
        await ep.preflightCheck();
        await ep.start();
    } catch (e) {
        console.error('Error while starting validator');
        console.error(e);
        process.exit(1);
    }
}

start();
