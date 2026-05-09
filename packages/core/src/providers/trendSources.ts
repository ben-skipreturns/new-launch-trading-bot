import type { TrendSource } from "../domain/interfaces.js";
import type { TrendObservation } from "../domain/types.js";

export class StaticTrendSource implements TrendSource {
  constructor(
    readonly name: string,
    private readonly observations: TrendObservation[]
  ) {}

  async fetchObservations(): Promise<TrendObservation[]> {
    return this.observations;
  }
}
