import { assertConsensusMathPow, findMathPowMismatches, MATH_POW_VECTORS } from './math_pow_guard';

describe('math pow guard', () => {
    test('runtime Math.pow matches the reference implementation (requires --no-use-std-math-pow on Node >= 24)', () => {
        expect(findMathPowMismatches()).toEqual([]);
        expect(() => assertConsensusMathPow()).not.toThrow();
    });

    test('reports a mismatch when pow differs by one ulp', () => {
        // Simulates std::pow: correct for every vector except 0.99 ** 32, which is 1 ulp low.
        const stdPow = (base: number, exponent: number) => {
            if (base === 0.99 && exponent === 32) return 0.7249803359578534;
            return MATH_POW_VECTORS.find((v) => v.base === base && v.exponent === exponent)?.expected ?? NaN;
        };
        expect(findMathPowMismatches(stdPow)).toEqual([{ base: 0.99, exponent: 32, expected: 0.7249803359578535, actual: 0.7249803359578534 }]);
    });
});
