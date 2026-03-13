/**
 * Occupancy grid: density map at a coarser resolution than the analysis buffer.
 *
 * Each cell covers CELL_SIZE × CELL_SIZE analysis pixels.
 * The cell value is the average luminance (or threshold) in that region,
 * representing "how much mass / presence is in this cell".
 *
 * Default: 160×90 analysis → 40×22 occupancy (cell size 4)
 * This gives a 40×22 grid of density values suitable for lattice-based rendering.
 *
 * WHY separate from the threshold map:
 * - Threshold gives per-pixel binary signal (noisy)
 * - Occupancy gives averaged regional mass (smoother, more stable for grid-based renders)
 */

export const DEFAULT_CELL_SIZE = 4;

export class OccupancyGrid {
  private cells: Uint8Array;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly cellSize: number;

  constructor(analysisWidth: number, analysisHeight: number, cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
    this.gridWidth = Math.floor(analysisWidth / cellSize);
    this.gridHeight = Math.floor(analysisHeight / cellSize);
    this.cells = new Uint8Array(this.gridWidth * this.gridHeight);
  }

  /**
   * Recompute occupancy from the luminance map.
   * Each cell value is the mean luminance of its region, [0, 255].
   */
  compute(luminance: Uint8Array, analysisWidth: number): void {
    const { gridWidth, gridHeight, cellSize } = this;
    const gridPixels = gridWidth * gridHeight;
    if (this.cells.length < gridPixels) {
      throw new Error('occupancy: cells buffer too small');
    }

    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        let sum = 0;
        let count = 0;

        for (let dy = 0; dy < cellSize; dy++) {
          for (let dx = 0; dx < cellSize; dx++) {
            const px = gx * cellSize + dx;
            const py = gy * cellSize + dy;
            const idx = py * analysisWidth + px;
            const val = luminance[idx];
            if (val !== undefined) {
              sum += val;
              count++;
            }
          }
        }

        this.cells[gy * gridWidth + gx] = count > 0 ? (sum / count) | 0 : 0;
      }
    }
  }

  /** Get occupancy value for a grid cell [0, 255]. */
  get(gx: number, gy: number): number {
    return this.cells[gy * this.gridWidth + gx] ?? 0;
  }

  /** Expose raw Uint8Array for GPU texture upload. */
  get data(): Uint8Array {
    return this.cells;
  }
}
