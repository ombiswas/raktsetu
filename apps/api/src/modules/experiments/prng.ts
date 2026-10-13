/**
 * Reproducible Seeded Pseudo-Random Number Generator (PRNG)
 * Uses Mulberry32 algorithm for deterministic random numbers across runs.
 */

export class SeededPRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = Math.floor(Math.abs(seed));
    // Mulberry32 initialization
    this.state = this.initialSeed;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  /**
   * Resets the PRNG state to the initial seed.
   */
  public reset(): void {
    this.state = this.initialSeed === 0 ? 0x6d2b79f5 : this.initialSeed;
  }

  /**
   * Returns the initial seed configured for this PRNG.
   */
  public getSeed(): number {
    return this.initialSeed;
  }

  /**
   * Generates a deterministic uniform pseudo-random number in [0, 1).
   */
  public random(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return result;
  }

  /**
   * Uniform float in [min, max).
   */
  public uniform(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Uniform integer in [min, max] inclusive.
   */
  public integer(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(this.uniform(low, high + 1));
  }

  /**
   * Generates a sample from a Gaussian/Normal distribution using Box-Muller transform.
   */
  public normal(mean = 0, stdDev = 1): number {
    let u1 = this.random();
    while (u1 <= 1e-15) {
      u1 = this.random();
    }
    const u2 = this.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Generates an exponential distribution sample (rate parameter lambda).
   */
  public exponential(rate: number): number {
    if (rate <= 0) {
      throw new Error(`Exponential rate must be positive, got ${rate}`);
    }
    let u = this.random();
    while (u <= 1e-15) {
      u = this.random();
    }
    return -Math.log(u) / rate;
  }

  /**
   * Generates a Poisson random variate using Knuth's algorithm.
   */
  public poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      // Gaussian approximation for large lambda
      const sample = Math.round(this.normal(lambda, Math.sqrt(lambda)));
      return Math.max(0, sample);
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= this.random();
    } while (p > L);
    return k - 1;
  }

  /**
   * Bernoulli trial with probability p in [0, 1].
   */
  public bernoulli(p: number): boolean {
    const clampedP = Math.max(0, Math.min(1, p));
    return this.random() < clampedP;
  }

  /**
   * Selects a random element from an array with optional relative weights.
   */
  public choice<T>(items: readonly T[], weights?: readonly number[]): T {
    if (items.length === 0) {
      throw new Error('Cannot select choice from an empty array');
    }
    if (!weights || weights.length === 0) {
      const idx = this.integer(0, items.length - 1);
      const item = items[idx];
      if (item === undefined) {
        throw new Error(`Failed to sample element at index ${idx}`);
      }
      return item;
    }

    if (weights.length !== items.length) {
      throw new Error('Weights length must match items length');
    }

    let totalWeight = 0;
    for (const w of weights) {
      if (w < 0) {
        throw new Error('Weights must be non-negative');
      }
      totalWeight += w;
    }

    if (totalWeight <= 0) {
      throw new Error('Sum of weights must be greater than zero');
    }

    const roll = this.random() * totalWeight;
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i]!;
      if (roll <= cumulative) {
        const selected = items[i];
        if (selected !== undefined) return selected;
      }
    }

    const fallback = items[items.length - 1];
    if (fallback === undefined) {
      throw new Error('Fallback choice item is undefined');
    }
    return fallback;
  }

  /**
   * Shuffles an array in place using Fisher-Yates algorithm.
   */
  public shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.integer(0, i);
      const temp = array[i]!;
      array[i] = array[j]!;
      array[j] = temp;
    }
    return array;
  }
}
