// jstat ships no types and no @types/jstat exists. Covers the static API, not jStat(...) matrices.
declare module "jstat" {
  interface Continuous<P extends number[]> {
    pdf(x: number, ...params: P): number
    cdf(x: number, ...params: P): number
    inv(p: number, ...params: P): number
    mean(...params: P): number
    mode(...params: P): number
    variance(...params: P): number
    sample(...params: P): number
  }

  interface ContinuousWithMedian<P extends number[]> extends Continuous<P> {
    median(...params: P): number
  }

  interface JStat {
    normal: ContinuousWithMedian<[mean: number, std: number]>
    studentt: ContinuousWithMedian<[dof: number]>
    chisquare: ContinuousWithMedian<[dof: number]>
    centralF: Continuous<[df1: number, df2: number]>
    gamma: Continuous<[shape: number, scale: number]>
    beta: ContinuousWithMedian<[alpha: number, beta: number]>
    exponential: ContinuousWithMedian<[rate: number]>
    lognormal: ContinuousWithMedian<[mu: number, sigma: number]>
    uniform: ContinuousWithMedian<[a: number, b: number]>
    binomial: {
      pdf(k: number, n: number, p: number): number
      cdf(k: number, n: number, p: number): number
    }
    poisson: {
      pdf(k: number, lambda: number): number
      cdf(k: number, lambda: number): number
      mean(lambda: number): number
      variance(lambda: number): number
      sample(lambda: number): number
    }

    sum(arr: number[]): number
    mean(arr: number[]): number
    median(arr: number[]): number
    mode(arr: number[]): number | number[]
    range(arr: number[]): number
    /** `flag` true uses the sample (n - 1) denominator. */
    variance(arr: number[], flag?: boolean): number
    /** `flag` true uses the sample (n - 1) denominator. */
    stdev(arr: number[], flag?: boolean): number
    pooledstdev(arrays: number[][]): number
    skewness(arr: number[]): number
    kurtosis(arr: number[]): number
    quantiles(arr: number[], quantiles: number[], alphap?: number, betap?: number): number[]
    percentile(arr: number[], k: number, exclusive?: boolean): number
    rank(arr: number[]): number[]
    covariance(arr1: number[], arr2: number[]): number
    corrcoeff(arr1: number[], arr2: number[]): number
    spearmancoeff(arr1: number[], arr2: number[]): number

    zscore(value: number, mean: number, sd: number): number
    zscore(value: number, arr: number[], flag?: boolean): number
    ztest(zscore: number, sides?: 1 | 2): number
    ztest(value: number, mean: number, sd: number, sides?: 1 | 2): number
    ztest(value: number, arr: number[], sides?: 1 | 2, flag?: boolean): number
    tscore(value: number, mean: number, sd: number, n: number): number
    tscore(value: number, arr: number[]): number
    ttest(tscore: number, n: number, sides?: 1 | 2): number
    ttest(value: number, mean: number, sd: number, n: number, sides?: 1 | 2): number
    ttest(value: number, arr: number[], sides?: 1 | 2): number
    anovafscore(...groups: number[][]): number
    anovaftest(...groups: number[][]): number
    anovaftest(fscore: number, df1: number, df2: number): number
    ftest(fscore: number, df1: number, df2: number): number
    tukeyhsd(groups: number[][]): [pair: [number, number], p: number][]
    normalci(value: number, alpha: number, sd: number, n: number): [number, number]
    normalci(value: number, alpha: number, arr: number[]): [number, number]
    tci(value: number, alpha: number, sd: number, n: number): [number, number]
    tci(value: number, alpha: number, arr: number[]): [number, number]

    /** Replaces Math.random for every `sample` call, e.g. with a seedrandom generator. */
    setRandom(fn: () => number): void
  }

  const jStat: JStat
  export default jStat
}
