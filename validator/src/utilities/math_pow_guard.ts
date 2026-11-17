/**
 * Consensus guard for floating point exponentiation.
 *
 * Since Node 24.0 V8 defaults `--use-std-math-pow` to on, so `Math.pow` and `**` delegate to the
 * platform std::pow. That result differs by 1 ulp from the V8-internal implementation used by
 * Node <= 23 (the reference implementation runs node:23.3). Consensus code such as staking reward
 * pool decline (`reduction_pct ** total_reductions`) then produces different block hashes.
 *
 * Starting node with `--no-use-std-math-pow` restores the V8-internal pow. The flag is a V8 flag and
 * is rejected in NODE_OPTIONS, so it must be passed on the node command line.
 */

export const MATH_POW_FLAG = '--no-use-std-math-pow';

// Known vectors where std::pow and the V8-internal pow disagree. Expected values match Node 23.3.
export const MATH_POW_VECTORS: ReadonlyArray<{ base: number; exponent: number; expected: number }> = [
    { base: 0.99, exponent: 32, expected: 0.7249803359578535 },
    { base: 0.99, exponent: 100, expected: 0.36603234127322914 },
];

export type MathPowMismatch = { base: number; exponent: number; expected: number; actual: number };

// Takes operands as runtime values so the bundler and V8 parser cannot constant-fold the result.
export function findMathPowMismatches(pow: (base: number, exponent: number) => number = Math.pow): MathPowMismatch[] {
    const mismatches: MathPowMismatch[] = [];
    for (const { base, exponent, expected } of MATH_POW_VECTORS) {
        const actual = pow(base, exponent);
        if (!Object.is(actual, expected)) {
            mismatches.push({ base, exponent, expected, actual });
        }
    }
    return mismatches;
}

export function assertConsensusMathPow(): void {
    const mismatches = findMathPowMismatches();
    if (mismatches.length > 0) {
        const detail = mismatches.map((m) => `${m.base} ** ${m.exponent} = ${m.actual} (expected ${m.expected})`).join('; ');
        throw new Error(
            `Math.pow does not match the reference implementation: ${detail}. ` +
                `Start node with ${MATH_POW_FLAG} (Node ${process.versions.node}). The flag is not accepted in NODE_OPTIONS.`,
        );
    }
}
