/**
 * One-Euro filter (Casiez, Roussel, Vogel 2012) for scalar and 3-vector
 * signals. Allocation-free after construction.
 */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  private x = 0;
  private dx = 0;
  private has = false;
  constructor(public params: OneEuroParams) {}

  reset(): void {
    this.has = false;
    this.dx = 0;
  }

  filter(value: number, dt: number): number {
    if (!this.has || dt <= 0) {
      this.x = value;
      this.dx = 0;
      this.has = true;
      return value;
    }
    const { minCutoff, beta, dCutoff } = this.params;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(dCutoff, dt) * (rawDx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export class OneEuro3 {
  readonly out = new Float64Array(3);
  private fx: OneEuro;
  private fy: OneEuro;
  private fz: OneEuro;
  constructor(params: OneEuroParams) {
    this.fx = new OneEuro(params);
    this.fy = new OneEuro(params);
    this.fz = new OneEuro(params);
  }
  setParams(params: OneEuroParams): void {
    this.fx.params = this.fy.params = this.fz.params = params;
  }
  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
  filter(x: number, y: number, z: number, dt: number): Float64Array {
    this.out[0] = this.fx.filter(x, dt);
    this.out[1] = this.fy.filter(y, dt);
    this.out[2] = this.fz.filter(z, dt);
    return this.out;
  }
}
